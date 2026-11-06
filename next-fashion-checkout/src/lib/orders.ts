import crypto from "node:crypto";
import type { CartItem, Lang, Order, PaymentMethod } from "./types";
import { db, findVariant, save } from "./store";
import { computeQuote, type CatalogLookup, type CouponError, type Quote } from "./pricing";
import { normalizePhone, validateContact, type ContactInput, type FieldError } from "./validation";
import { findProvince, findWard } from "./data/locations";
import { createDynamicQr } from "./sepay";
import { enqueueMail, retryFailedMails } from "./mail";

export const MAX_PENDING_PER_PHONE = 3; // REQ-A7.5.4 (đề xuất)

export function lookup(): CatalogLookup {
  const store = db();
  return { findVariant, coupons: store.coupons, couponUsage: store.couponUsage };
}

export function quote(input: Parameters<typeof computeQuote>[0]): Quote {
  sweep();
  return computeQuote(input, lookup());
}

export interface PlaceOrderInput {
  idempotencyKey: string;
  items: CartItem[];
  contact: ContactInput;
  couponCode?: string;
  method?: PaymentMethod;
  agreedTerms: boolean;
  lang: Lang;
  memberId?: string;
  expected: { total: number; shippingFee: number; discount: number; lines: { variantId: string; price: number; qty: number }[] };
}

export type Change =
  | { type: "price"; variantId: string; name: string; oldPrice: number; newPrice: number }
  | { type: "qty_reduced"; variantId: string; name: string; oldQty: number; newQty: number }
  | { type: "coupon_invalid"; code: string; error: CouponError; shortfall?: number }
  | { type: "shipping"; oldFee: number; newFee: number }
  | { type: "total"; oldTotal: number; newTotal: number };

export type PlaceOrderResult =
  | { ok: true; order: Order; duplicate?: boolean }
  | { ok: false; error: "validation"; fields: Partial<Record<keyof ContactInput, FieldError>> }
  | { ok: false; error: "terms_required" | "method_required" | "cod_not_allowed" | "shipping_unsupported" | "empty_cart" | "pending_limit" | "sepay_error" }
  | { ok: false; error: "out_of_stock"; variants: { variantId: string; name: string }[] }
  | { ok: false; error: "changed"; changes: Change[] };

function nextOrderCode(now: Date) {
  const store = db();
  // yymmdd theo giờ Việt Nam (UTC+7)
  const d = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, "");
  store.orderSeq[d] = (store.orderSeq[d] ?? 0) + 1;
  // Chỉ gồm chữ không dấu và số để ngân hàng không cắt nội dung chuyển khoản
  return `NF${d}${String(store.orderSeq[d]).padStart(4, "0")}`;
}

function restoreStock(order: Order) {
  for (const it of order.items) {
    const f = findVariant(it.variantId);
    if (f) f.variant.stock += it.qty;
  }
  for (const u of db().couponUsage) if (u.orderCode === order.code) u.active = false;
}

export async function placeOrder(input: PlaceOrderInput, now = new Date()): Promise<PlaceOrderResult> {
  sweep(now);
  const store = db();

  // Bấm nhiều lần / mạng chậm: cùng một khóa chỉ tạo một đơn
  const existing = store.orders.find((o) => o.idempotencyKey === input.idempotencyKey && o.status !== "canceled_qr_error");
  if (existing) return { ok: true, order: existing, duplicate: true };

  const fields = validateContact(input.contact);
  if (Object.keys(fields).length) return { ok: false, error: "validation", fields };
  if (!input.agreedTerms) return { ok: false, error: "terms_required" };
  if (input.method !== "cod" && input.method !== "sepay") return { ok: false, error: "method_required" };

  const phone = normalizePhone(input.contact.phone);
  const email = input.contact.email.trim().toLowerCase();

  // ---- Từ đây đến lúc trừ tồn chạy đồng bộ: không có yêu cầu nào chen vào giữa ----
  const q = computeQuote(
    { items: input.items, provinceId: input.contact.provinceId, wardId: input.contact.wardId, couponCode: input.couponCode, phone, email, now },
    lookup(),
  );
  if (!q.lines.length) return { ok: false, error: "empty_cart" };

  const blocked = q.lines.filter((l) => l.state === "out_of_stock" || l.state === "inactive" || l.state === "missing");
  if (blocked.length) {
    return { ok: false, error: "out_of_stock", variants: blocked.map((l) => ({ variantId: l.variantId, name: `${l.name[input.lang]} (${l.color[input.lang]}, ${l.size})` })) };
  }
  if (q.shipping.status !== "ok") return { ok: false, error: "shipping_unsupported" };

  // Kiểm tra lại giá, số lượng, mã giảm giá và phí ship tại thời điểm bấm (REQ-A7.5.2)
  const changes: Change[] = [];
  for (const exp of input.expected.lines) {
    const cur = q.lines.find((l) => l.variantId === exp.variantId);
    if (!cur) continue;
    const name = `${cur.name[input.lang]} (${cur.color[input.lang]}, ${cur.size})`;
    if (cur.price !== exp.price) changes.push({ type: "price", variantId: cur.variantId, name, oldPrice: exp.price, newPrice: cur.price });
    if (cur.qty < exp.qty) changes.push({ type: "qty_reduced", variantId: cur.variantId, name, oldQty: exp.qty, newQty: cur.qty });
  }
  if (q.coupon?.status === "invalid") changes.push({ type: "coupon_invalid", code: q.coupon.code, error: q.coupon.error, shortfall: q.coupon.shortfall });
  if (q.shipping.fee !== input.expected.shippingFee) changes.push({ type: "shipping", oldFee: input.expected.shippingFee, newFee: q.shipping.fee });
  if (q.total !== input.expected.total) changes.push({ type: "total", oldTotal: input.expected.total, newTotal: q.total });
  if (changes.length) return { ok: false, error: "changed", changes };

  if (input.method === "cod" && !q.codAllowed) return { ok: false, error: "cod_not_allowed" };

  const pending = store.orders.filter(
    (o) => o.customer.phone === phone && (o.status === "pending_confirmation" || o.status === "awaiting_payment"),
  ).length;
  if (pending >= MAX_PENDING_PER_PHONE) return { ok: false, error: "pending_limit" };

  const province = findProvince(input.contact.provinceId)!;
  const ward = findWard(input.contact.provinceId, input.contact.wardId)!;
  const code = nextOrderCode(now);
  const at = now.toISOString();
  const order: Order = {
    code,
    token: crypto.randomBytes(16).toString("hex"),
    lang: input.lang,
    createdAt: at,
    memberId: input.memberId,
    customer: { name: input.contact.name.trim(), phone, email },
    address: { provinceId: province.id, wardId: ward.id, provinceName: province.name, wardName: ward.name, line: input.contact.line.trim() },
    note: input.contact.note.trim(),
    items: q.lines.map((l) => ({
      variantId: l.variantId, productId: l.productId, sku: l.sku, name: l.name, color: l.color, size: l.size, swatch: l.swatch, image: l.image, price: l.price, qty: l.qty,
    })),
    subtotal: q.subtotal,
    discount: q.discount,
    shippingFee: q.shipping.fee,
    shippingDiscount: q.shippingDiscount,
    total: q.total,
    couponCode: q.coupon?.status === "applied" ? q.coupon.code : undefined,
    method: input.method,
    status: input.method === "cod" ? "pending_confirmation" : "awaiting_payment",
    paymentStatus: input.method === "cod" ? "unpaid" : "awaiting",
    eta: q.shipping.eta!,
    timeline: [{ status: input.method === "cod" ? "pending_confirmation" : "awaiting_payment", at }],
    purchaseTracked: false,
    idempotencyKey: input.idempotencyKey,
  };

  // Trừ tồn kho ngay khi tạo đơn (cả COD và SePay) và ghi nhận lượt dùng mã
  for (const it of order.items) findVariant(it.variantId)!.variant.stock -= it.qty;
  if (order.couponCode) store.couponUsage.push({ code: order.couponCode, phone, email, orderCode: code, active: true });
  store.orders.unshift(order);
  save();
  // ---- Hết đoạn đồng bộ ----

  if (order.method === "sepay") {
    try {
      order.sepay = await createDynamicQr(order.code, order.total, now);
    } catch {
      // SePay không tạo được QR: hủy đơn vừa tạo, hoàn tồn và lượt mã, không để đơn treo
      order.status = "canceled_qr_error";
      order.paymentStatus = "none";
      order.timeline.push({ status: "canceled_qr_error", at: new Date().toISOString() });
      restoreStock(order);
      save();
      return { ok: false, error: "sepay_error" };
    }
  }
  enqueueMail(order, "order_confirmed", now);
  save();
  return { ok: true, order };
}

export function getOrder(code: string, token: string | null | undefined) {
  sweep();
  const o = db().orders.find((x) => x.code === code);
  // Không đúng mã truy cập thì coi như không có đơn (không tiết lộ đơn có tồn tại)
  if (!o || !token || o.token !== token || o.status === "canceled_qr_error") return undefined;
  return o;
}

export function markPurchaseTracked(code: string, token: string) {
  const o = getOrder(code, token);
  if (!o || o.purchaseTracked) return false;
  o.purchaseTracked = true;
  save();
  return true;
}

export function cancelForTimeout(o: Order, now: Date) {
  o.status = "canceled_timeout";
  o.paymentStatus = "none";
  o.timeline.push({ status: "canceled_timeout", at: now.toISOString() });
  restoreStock(o);
  enqueueMail(o, "canceled_timeout", now);
}

// Hủy các đơn SePay quá 15 phút chưa thanh toán, hoàn tồn kho (REQ-A7.4.2)
export function sweep(now = new Date()) {
  let changed = false;
  for (const o of db().orders) {
    if (o.status === "awaiting_payment" && o.sepay && now.getTime() >= Date.parse(o.sepay.expiresAt)) {
      cancelForTimeout(o, now);
      changed = true;
    }
  }
  if (changed) save();
  retryFailedMails(now);
}

export function publicOrder(o: Order) {
  const { token: _t, idempotencyKey: _k, ...rest } = o;
  return rest;
}

const gs = globalThis as unknown as { __nfSweeper?: NodeJS.Timeout };
if (typeof window === "undefined" && !gs.__nfSweeper && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  gs.__nfSweeper = setInterval(() => { try { sweep(); } catch { /* bỏ qua, lượt sau chạy lại */ } }, 5000);
  gs.__nfSweeper.unref?.();
}
