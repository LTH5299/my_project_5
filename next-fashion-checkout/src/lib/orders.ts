import crypto from "node:crypto";
import type { Address, Carrier, Customer, Lang, Order, OrderLine, OrderStatus, PaymentSession, ShippingPackage } from "./types";
import { db, findVariant, save } from "./store";
import { findProvince, findWard } from "./data/locations";
import { validateContact, normalizePhone, type FieldError } from "./validation";
import { quoteCheckout, diffSeen, type Change, type SeenMoney } from "./quote";
import { cancelWaybill, createWaybill, mapGhnStatus, mapVtpStatus, quoteShipping, STATUS_RANK } from "./shipping";
import { retryFailedMails, sendMail } from "./mail";
import { logCall } from "./log";
import type { QuoteLine } from "./pricing";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rand = (n: number) => Array.from(crypto.randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join("");
const token = () => crypto.randomBytes(16).toString("hex");
const iso = (d: Date) => d.toISOString();

function uniqueCode(prefix: "NF" | "NFP") {
  const store = db();
  for (;;) {
    const c = prefix + rand(8);
    if (!store.orders.some((o) => o.code === c) && !store.sessions.some((s) => s.code === c)) return c;
  }
}

// ---------- Đặt hàng (UC-05 / UC-06) ----------
export interface CheckoutInput {
  items: { variantId: string; qty: number }[];
  customer: Customer;
  address: { provinceId: string; wardId: string; line: string };
  note?: string;
  pkgId: string;
  couponCode?: string;
  method: "cod" | "sepay";
  lang: Lang;
  idempotencyKey: string;
  memberId?: string;
  saveProfile?: boolean;
  agreed: boolean;
  seen: SeenMoney;
}

export type CheckoutResult =
  | { status: "order"; code: string; token: string }
  | { status: "session"; code: string; token: string }
  | { status: "invalid"; errors: Partial<Record<string, FieldError>> }
  | { status: "changed"; changes: Change[] }
  | { status: "error"; error: "empty" | "terms" | "cod_over_cap" | "cod_pending_limit" | "sepay_unavailable" | "no_package" | "unserved" };

const toLines = (lines: QuoteLine[]): OrderLine[] =>
  lines.filter((l) => l.qty > 0).map((l) => ({
    variantId: l.variantId, productId: l.productId, sku: l.sku, name: l.name, color: l.color, size: l.size,
    swatch: l.swatch, image: l.image, price: l.price, qty: l.qty, weightGrams: l.weightGrams,
  }));

function moveStock(items: OrderLine[], sign: 1 | -1) {
  for (const it of items) {
    const f = findVariant(it.variantId);
    if (f) f.variant.stock += sign * it.qty;
  }
}

const pendingCodCount = (phone: string) =>
  db().orders.filter((o) => o.method === "cod" && o.status === "pending_confirmation" && o.customer.phone === phone).length;

export function submitCheckout(input: CheckoutInput, now = new Date()): CheckoutResult {
  const store = db();
  const s = store.settings;
  tick(now);

  // Bấm nhiều lần / mạng chập chờn: trả lại đúng kết quả lần đầu
  const dupOrder = store.orders.find((o) => o.idempotencyKey === input.idempotencyKey);
  if (dupOrder) return { status: "order", code: dupOrder.code, token: dupOrder.token };
  const dupSession = store.sessions.find((x) => x.idempotencyKey === input.idempotencyKey && x.status === "pending");
  if (dupSession) return { status: "session", code: dupSession.code, token: dupSession.token };

  const customer = { name: (input.customer?.name ?? "").trim(), phone: normalizePhone(input.customer?.phone ?? ""), email: (input.customer?.email ?? "").trim() };
  const errors = validateContact({ ...customer, provinceId: input.address?.provinceId, wardId: input.address?.wardId, line: input.address?.line ?? "", note: input.note ?? "" });
  if (Object.keys(errors).length) return { status: "invalid", errors };
  if (!input.agreed) return { status: "error", error: "terms" };

  const q = quoteCheckout({ items: input.items, provinceId: input.address.provinceId, wardId: input.address.wardId, pkgId: input.pkgId, couponCode: input.couponCode, phone: customer.phone, email: customer.email, now });
  if (!q.lines.some((l) => l.qty > 0)) return { status: "error", error: "empty" };
  if (q.shipping?.status === "unserved") return { status: "error", error: "unserved" };
  if (!q.pkg || q.pkg.id !== input.pkgId) {
    // Gói khách chọn không còn: coi là thay đổi phí giao
    if (q.shipping?.status !== "ok") return { status: "error", error: "no_package" };
  }
  const changes = q.blocking ? [{ kind: "stock" as const, step: 0 as const }] : diffSeen(q, input.seen, input.couponCode);
  if (q.pkg && q.pkg.id !== input.pkgId && !changes.some((c) => c.kind === "shipping")) changes.push({ kind: "shipping", step: 2 });
  if (changes.length) return { status: "changed", changes };

  const pkg = q.pkg!;
  const address: Address = {
    provinceId: input.address.provinceId, wardId: input.address.wardId,
    provinceName: findProvince(input.address.provinceId)!.name, wardName: findWard(input.address.provinceId, input.address.wardId)!.name,
    line: input.address.line.trim(),
  };
  const items = toLines(q.lines);
  const couponCode = q.coupon?.status === "applied" ? q.coupon.code : undefined;

  if (input.memberId && input.saveProfile) {
    store.savedProfiles[input.memberId] = { ...customer, provinceId: address.provinceId, wardId: address.wardId, line: address.line };
  }

  if (input.method === "sepay") {
    if (s.sepayDisabled) return { status: "error", error: "sepay_unavailable" };
    const session: PaymentSession = {
      code: uniqueCode("NFP"), token: token(), idempotencyKey: input.idempotencyKey, lang: input.lang, status: "pending",
      createdAt: iso(now), expiresAt: iso(new Date(now.getTime() + s.sessionMinutes * 60_000)),
      customer, address, note: (input.note ?? "").trim(), items, money: q.money, couponCode, pkg, memberId: input.memberId,
    };
    moveStock(items, -1); // giữ hàng trong thời gian phiên
    store.sessions.unshift(session);
    logCall({ partner: "SePay", action: "create-session", http: 200, ms: 40, ref: session.code, note: `${q.money.total}` });
    save();
    return { status: "session", code: session.code, token: session.token };
  }

  // COD
  if (q.money.total > s.codCap) return { status: "error", error: "cod_over_cap" };
  if (pendingCodCount(customer.phone) >= 3) return { status: "error", error: "cod_pending_limit" };
  const blocked = s.blockedPhones.includes(customer.phone);
  const auto = q.money.total <= s.autoConfirmCap && !blocked;
  const order = newOrder({ method: "cod", lang: input.lang, customer, address, note: (input.note ?? "").trim(), items, money: q.money, couponCode, pkg, memberId: input.memberId, idempotencyKey: input.idempotencyKey }, now);
  order.paymentStatus = "cod_unpaid";
  order.autoConfirmed = auto;
  order.status = auto ? "packing" : "pending_confirmation";
  if (!auto) order.confirmReason = blocked ? "blocked_phone" : "cod_over_cap";
  order.timeline.push({ status: order.status, at: iso(now), note: auto ? "Tự xác nhận" : undefined });
  moveStock(items, -1);
  useCoupon(order);
  store.orders.unshift(order);
  sendMail(order, "EM-01", "EM-01", now);
  if (auto) issueWaybill(order, now);
  save();
  return { status: "order", code: order.code, token: order.token };
}

function newOrder(p: { method: "cod" | "sepay"; lang: Lang; customer: Customer; address: Address; note: string; items: OrderLine[]; money: Order["money"]; couponCode?: string; pkg: ShippingPackage; memberId?: string; idempotencyKey: string }, now: Date): Order {
  return {
    code: uniqueCode("NF"), token: token(), lang: p.lang, createdAt: iso(now), method: p.method,
    status: "packing", paymentStatus: "cod_unpaid", autoConfirmed: false, callAttempts: 0, memberId: p.memberId,
    customer: p.customer, address: p.address, note: p.note, items: p.items, money: p.money, couponCode: p.couponCode,
    shipment: { carrier: p.pkg.carrier, serviceName: p.pkg.serviceName, quotedFee: p.pkg.fee, etaDate: p.pkg.etaDate, failCount: 0 },
    timeline: [{ status: "created", at: iso(now) }], purchaseTracked: false, idempotencyKey: p.idempotencyKey,
  };
}

function useCoupon(o: Order) {
  if (!o.couponCode) return;
  db().couponUsage.push({ code: o.couponCode, phone: o.customer.phone, email: o.customer.email.toLowerCase(), orderCode: o.code, active: true });
}
function releaseCoupon(o: Order) {
  for (const u of db().couponUsage) if (u.orderCode === o.code) u.active = false;
}

// ---------- Vận đơn tự động (v1.2: tạo ngay khi đơn đủ điều kiện) ----------
export function issueWaybill(o: Order, now = new Date()) {
  const s = db().settings;
  const cod = o.method === "cod" ? o.money.total : 0;
  const r = createWaybill(o.shipment.carrier, o.code, cod, s.waybillFail);
  if (!r.ok) {
    o.shipment.error = r.error;
    o.shipment.failCount += 1;
    o.status = "packing";
    o.timeline.push({ status: "waybill_error", at: iso(now), note: r.error });
    return false;
  }
  o.shipment.trackingCode = r.trackingCode;
  o.shipment.labelUrl = r.labelUrl;
  o.shipment.error = undefined;
  o.status = "awaiting_pickup";
  o.timeline.push({ status: "waybill", at: iso(now), note: `${o.shipment.carrier} ${r.trackingCode}` });
  o.timeline.push({ status: "awaiting_pickup", at: iso(now) });
  sendMail(o, "EM-03", "EM-03", now);
  return true;
}

// Admin: "Sửa & tạo lại" hoặc đổi ĐVVC (lấy gói rẻ nhất của hãng mới)
export function retryWaybill(code: string, carrier?: Carrier, now = new Date()) {
  const o = findOrder(code);
  if (!o || o.status !== "packing" || !o.shipment.error) return { ok: false as const, error: "not_retryable" };
  if (carrier && carrier !== o.shipment.carrier) {
    const grams = o.items.reduce((t, i) => t + i.weightGrams * i.qty, 0);
    const pkg = quoteShipping(o.address.provinceId, o.address.wardId, grams, db().settings, now).packages.find((p) => p.carrier === carrier);
    if (!pkg) return { ok: false as const, error: "carrier_unavailable" };
    o.shipment.carrier = pkg.carrier; o.shipment.serviceName = pkg.serviceName; o.shipment.etaDate = pkg.etaDate; o.shipment.actualFee = pkg.fee;
  }
  const ok = issueWaybill(o, now);
  save();
  return ok ? { ok: true as const } : { ok: false as const, error: o.shipment.error };
}

// ---------- Phiên SePay ----------
export function findSession(code: string) {
  return db().sessions.find((x) => x.code === code.toUpperCase());
}

// Tạo đơn "Đã thanh toán" từ phiên (hàng đã giữ sẵn khi phiên còn chờ)
export function orderFromSession(x: PaymentSession, transactionId: string, now: Date, stockHeld: boolean): Order {
  const store = db();
  const o = newOrder({ method: "sepay", lang: x.lang, customer: x.customer, address: x.address, note: x.note, items: x.items, money: x.money, couponCode: x.couponCode, pkg: x.pkg, memberId: x.memberId, idempotencyKey: "session:" + x.code }, now);
  o.status = "paid"; o.paymentStatus = "paid"; o.autoConfirmed = true; o.sessionCode = x.code; o.transactionId = transactionId;
  o.timeline.push({ status: "paid", at: iso(now), note: `GD ${transactionId}` });
  if (!stockHeld) moveStock(o.items, -1);
  useCoupon(o);
  store.orders.unshift(o);
  x.status = "paid"; x.closedAt = iso(now); x.orderCode = o.code; x.orderToken = o.token; x.transactionId = transactionId;
  sendMail(o, "EM-02", "EM-02", now);
  issueWaybill(o, now);
  return o;
}

// "Đổi sang COD": đóng phiên, nhả hàng. Khách quay lại Bước 4 với nháp cũ.
export function closeSession(code: string, tok: string, now = new Date()) {
  const x = findSession(code);
  if (!x || x.token !== tok) return { ok: false as const, error: "not_found" };
  if (x.status === "paid") return { ok: false as const, error: "paid", orderCode: x.orderCode, orderToken: x.orderToken };
  if (x.status === "pending") { x.status = "closed"; x.closedAt = iso(now); moveStock(x.items, 1); save(); }
  return { ok: true as const };
}

// Hết 15 phút: tra cứu giao dịch SePay một lần cuối, không thấy thì hết hạn (không tạo đơn, không gửi email)
export function expireSessions(now = new Date()) {
  const store = db();
  let changed = false;
  for (const x of store.sessions) {
    if (x.status !== "pending" || Date.parse(x.expiresAt) > now.getTime()) continue;
    logCall({ partner: "SePay", action: "transactions/list", http: 200, ms: 220, ref: x.code, note: "Đối soát cuối phiên" });
    const tx = store.sepayLedger.find((t) => (t.code === x.code || t.content.toUpperCase().includes(x.code)) && t.amount === x.money.total && !store.processedTransactionIds.includes(t.id));
    if (tx) {
      store.processedTransactionIds.push(tx.id);
      orderFromSession(x, tx.id, now, true);
    } else {
      x.status = "expired"; x.closedAt = iso(now);
      moveStock(x.items, 1);
    }
    changed = true;
  }
  if (changed) save();
}

export function tick(now = new Date()) {
  expireSessions(now);
  retryFailedMails(now);
}

// ---------- Tra cứu đơn (UC-09) ----------
export function findOrder(code: string) {
  return db().orders.find((o) => o.code === code.trim().toUpperCase());
}
export function accessOrder(code: string, by: { token?: string; phone?: string; memberId?: string }) {
  const o = findOrder(code);
  if (!o) return undefined;
  if (by.token && by.token === o.token) return o;
  if (by.phone && normalizePhone(by.phone) === o.customer.phone) return o;
  if (by.memberId && by.memberId === o.memberId) return o;
  return undefined;
}

// ---------- Hủy đơn (UC-10) ----------
const CANCELABLE: OrderStatus[] = ["pending_confirmation", "paid", "packing", "awaiting_pickup"];

export function cancelOrder(o: Order, reason: string, by: "customer" | "cskh" | "carrier", now = new Date()) {
  if (!CANCELABLE.includes(o.status)) return { ok: false as const, error: "not_cancelable" };
  if (!reason.trim()) return { ok: false as const, error: "reason_required" };
  if (o.shipment.trackingCode && by !== "carrier") {
    if (!cancelWaybill(o.shipment.carrier, o.shipment.trackingCode, db().settings.carrierPickedUp)) return { ok: false as const, error: "picked_up" };
  }
  finalizeCancel(o, reason.trim(), now);
  save();
  return { ok: true as const };
}

function finalizeCancel(o: Order, reason: string, now: Date) {
  o.status = "canceled";
  o.cancelReason = reason;
  moveStock(o.items, 1);
  releaseCoupon(o);
  if (o.paymentStatus === "paid") requestRefund(o, reason, now);
  o.timeline.push({ status: "canceled", at: iso(now), note: reason });
  sendMail(o, "EM-05", "EM-05", now, reason);
}

function requestRefund(o: Order, reason: string, now: Date) {
  o.paymentStatus = "refund_pending";
  db().refunds.unshift({ orderCode: o.code, amount: o.money.total, reason, createdAt: iso(now), status: "open" });
}

export function completeRefund(orderCode: string) {
  const r = db().refunds.find((x) => x.orderCode === orderCode && x.status === "open");
  if (!r) return false;
  r.status = "done"; r.refundRef = "HT" + rand(8);
  const o = findOrder(orderCode);
  if (o) o.paymentStatus = "refunded";
  save();
  return true;
}

// ---------- CSKH (ADM-01) ----------
export function confirmCod(code: string, now = new Date()) {
  const o = findOrder(code);
  if (!o || o.status !== "pending_confirmation") return false;
  o.status = "packing";
  o.timeline.push({ status: "packing", at: iso(now), note: "CSKH xác nhận" });
  issueWaybill(o, now);
  save();
  return true;
}

export function recordCall(code: string, now = new Date()) {
  const o = findOrder(code);
  if (!o || o.status !== "pending_confirmation") return undefined;
  o.callAttempts += 1;
  save();
  return o.callAttempts;
}

export function cancelUnreachable(code: string, now = new Date()) {
  const o = findOrder(code);
  if (!o || o.status !== "pending_confirmation" || o.callAttempts < 2) return false;
  return cancelOrder(o, "Không liên lạc được", "cskh", now).ok;
}

// ---------- Kho (STF-01) ----------
export const expectedWeight = (o: Order) => o.items.reduce((t, i) => t + i.weightGrams * i.qty, 0);

export function packOrder(code: string, grams: number, now = new Date()) {
  const o = findOrder(code);
  if (!o || o.status !== "awaiting_pickup" || !o.shipment.trackingCode) return { ok: false as const, error: "not_packable" };
  if (!Number.isFinite(grams) || grams <= 0) return { ok: false as const, error: "weight_required" };
  const exp = expectedWeight(o);
  const deviation = exp ? Math.abs(grams - exp) / exp : 0;
  o.packedWeightGrams = Math.round(grams);
  o.timeline.push({ status: "awaiting_pickup", at: iso(now), note: `Đóng gói xong ${o.packedWeightGrams}g` });
  save();
  return { ok: true as const, warn: deviation > 0.3, expected: exp };
}

// ---------- Webhook ĐVVC (UC-13): chỉ cập nhật theo chiều tiến ----------
export function handleCarrierEvent(carrier: Carrier, trackingCode: string, raw: string | number, eventId: string, now = new Date(), fee?: number) {
  const store = db();
  const key = `${carrier}:${eventId}`;
  if (store.carrierEvents.includes(key)) return { ok: true, duplicate: true };
  const o = store.orders.find((x) => x.shipment.trackingCode === trackingCode && x.shipment.carrier === carrier);
  logCall({ partner: carrier, action: "webhook", http: o ? 200 : 404, ms: 15, ref: trackingCode, note: String(raw) });
  if (!o) return { ok: false, error: "not_found" };
  store.carrierEvents.push(key);
  const next = carrier === "GHN" ? mapGhnStatus(String(raw)) : mapVtpStatus(Number(raw));
  if (fee) o.shipment.actualFee = fee;
  if (!next || next === o.status) { save(); return { ok: true, ignored: true }; }
  const retryDelivery = o.status === "delivery_failed" && next === "shipping";
  if (!retryDelivery && STATUS_RANK[next] <= STATUS_RANK[o.status]) { save(); return { ok: true, ignored: true }; }
  if (STATUS_RANK[o.status] >= 6) { save(); return { ok: true, ignored: true }; } // đơn đã kết thúc

  if (next === "canceled") { finalizeCancel(o, "Đơn vị vận chuyển hủy vận đơn", now); save(); return { ok: true }; }
  o.status = next;
  o.timeline.push({ status: next, at: iso(now), note: `${carrier} ${raw}` });
  if (next === "delivered" && o.method === "cod") o.paymentStatus = "cod_reconcile";
  if (next === "returned") { moveStock(o.items, 1); if (o.paymentStatus === "paid") requestRefund(o, "Hoàn hàng", now); }
  if (next === "shipping" || next === "delivered" || next === "delivery_failed") {
    const n = o.timeline.filter((t) => t.status === next).length;
    sendMail(o, "EM-04", `EM-04:${next}:${n}`, now);
  }
  save();
  return { ok: true };
}

// Sự kiện Purchase chỉ ghi nhận 1 lần
export function markPurchaseTracked(code: string, tok: string) {
  const o = findOrder(code);
  if (!o || o.token !== tok || o.purchaseTracked) return false;
  o.purchaseTracked = true;
  save();
  return true;
}

export const isCancelable = (o: Order) => CANCELABLE.includes(o.status);

// Dữ liệu trả cho trình duyệt: bỏ khóa nội bộ
export function publicOrder(o: Order) {
  const { idempotencyKey: _k, ...rest } = o;
  return { ...rest, cancelable: isCancelable(o), refund: db().refunds.find((r) => r.orderCode === o.code) };
}

export function publicSession(x: PaymentSession) {
  const { idempotencyKey: _k, ...rest } = x;
  return rest;
}
