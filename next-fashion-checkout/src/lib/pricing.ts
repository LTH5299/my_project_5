import type { CartItem, Category, Coupon, CouponUsage, Localized, Money, Product, Settings, ShippingPackage, Variant } from "./types";
import { MAX_QTY_PER_VARIANT } from "./data/catalog";

export type LineState = "ok" | "reduced" | "out_of_stock" | "inactive" | "missing";

export interface QuoteLine {
  variantId: string; productId: string; sku: string; name: Localized; color: Localized; size: string; swatch: string; image?: string;
  category: Category; onSale: boolean; weightGrams: number; price: number; compareAt?: number;
  qty: number; requestedQty: number; available: number; lineTotal: number; state: LineState;
}

export type CouponError = "not_found" | "not_started" | "expired" | "out_of_uses" | "used_by_customer" | "min_not_met" | "not_applicable" | "sale_excluded";

export type CouponResult =
  | { status: "applied"; code: string; type: Coupon["type"]; discount: number; shippingDiscount: number; title: Localized; recheckOnPhone: boolean }
  | { status: "invalid"; code: string; error: CouponError; shortfall?: number };

export interface Lookup {
  findVariant(id: string): { product: Product; variant: Variant } | undefined;
  coupons: Coupon[];
  couponUsage: CouponUsage[];
}

export function buildLines(items: CartItem[], lookup: Lookup): QuoteLine[] {
  const merged = new Map<string, number>();
  for (const it of items) {
    const q = Math.floor(Number(it.qty));
    if (!it.variantId || !Number.isFinite(q) || q < 1) continue;
    merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + q);
  }
  const lines: QuoteLine[] = [];
  for (const [variantId, requestedQty] of merged) {
    const f = lookup.findVariant(variantId);
    if (!f) {
      lines.push({ variantId, productId: "", sku: "", name: { vi: "Sản phẩm không còn tồn tại", en: "Product no longer exists" }, color: { vi: "", en: "" }, size: "", swatch: "#ccc",
        category: "nam", onSale: false, weightGrams: 0, price: 0, qty: 0, requestedQty, available: 0, lineTotal: 0, state: "missing" });
      continue;
    }
    const { product: p, variant: v } = f;
    const available = Math.max(0, Math.min(v.stock, MAX_QTY_PER_VARIANT));
    let qty = Math.min(requestedQty, MAX_QTY_PER_VARIANT);
    let state: LineState = "ok";
    if (!v.active) { state = "inactive"; qty = 0; }
    else if (v.stock <= 0) { state = "out_of_stock"; qty = 0; }
    else if (qty > v.stock) { state = "reduced"; qty = v.stock; }
    lines.push({ variantId, productId: p.id, sku: v.sku, name: p.name, color: v.color, size: v.size, swatch: v.swatch, image: p.image,
      category: p.category, onSale: p.onSale, weightGrams: p.weightGrams, price: v.price, compareAt: v.compareAt,
      qty, requestedQty, available, lineTotal: qty * v.price, state });
  }
  return lines;
}

export const cartWeight = (lines: QuoteLine[]) => Math.max(200, lines.reduce((s, l) => s + l.weightGrams * l.qty, 0));
export const hasBlocking = (lines: QuoteLine[]) => lines.some((l) => l.state === "out_of_stock" || l.state === "inactive" || l.state === "missing");

const activeUses = (u: CouponUsage[], code: string) => u.filter((x) => x.active && x.code === code).length;
const customerUses = (u: CouponUsage[], code: string, phone?: string, email?: string) => {
  const em = email?.trim().toLowerCase();
  return u.filter((x) => x.active && x.code === code && ((phone && x.phone === phone) || (em && x.email === em))).length;
};

// Kiểm tra và tính một mã (SRS v1.2 BR-04.1–BR-04.4)
export function evaluateCoupon(rawCode: string, lines: QuoteLine[], shippingFee: number, lookup: Lookup, ctx: { phone?: string; email?: string; now: Date }): CouponResult {
  const code = rawCode.trim().toUpperCase();
  const c = lookup.coupons.find((x) => x.code === code);
  if (!c) return { status: "invalid", code, error: "not_found" };
  const now = ctx.now.getTime();
  if (now < Date.parse(c.startsAt)) return { status: "invalid", code, error: "not_started" };
  if (now > Date.parse(c.endsAt)) return { status: "invalid", code, error: "expired" }; // còn hiệu lực tới hết giây cuối
  if (activeUses(lookup.couponUsage, code) >= c.totalLimit) return { status: "invalid", code, error: "out_of_uses" };
  if ((ctx.phone || ctx.email) && customerUses(lookup.couponUsage, code, ctx.phone, ctx.email) >= c.perCustomerLimit) return { status: "invalid", code, error: "used_by_customer" };
  const live = lines.filter((l) => l.qty > 0);
  const subtotal = live.reduce((s, l) => s + l.lineTotal, 0);
  const inScope = live.filter((l) => !c.categories || c.categories.includes(l.category));
  const eligible = inScope.filter((l) => !(c.excludeSale && l.onSale));
  if (!inScope.length) return { status: "invalid", code, error: "not_applicable" };
  if (!eligible.length) return { status: "invalid", code, error: "sale_excluded" };
  if (subtotal < c.minSubtotal) return { status: "invalid", code, error: "min_not_met", shortfall: c.minSubtotal - subtotal };
  const base = eligible.reduce((s, l) => s + l.lineTotal, 0);
  let discount = 0, shippingDiscount = 0;
  if (c.type === "percent") discount = Math.min(Math.floor((base * c.value) / 100), c.maxDiscount ?? Infinity);
  else if (c.type === "fixed") discount = c.value;
  else shippingDiscount = Math.min(shippingFee, c.shipCap ?? Infinity);
  discount = Math.min(discount, subtotal);
  return { status: "applied", code, type: c.type, discount, shippingDiscount, title: c.title, recheckOnPhone: !ctx.phone && c.perCustomerLimit > 0 };
}

// Danh sách mã trong hộp thoại SCR-04: mã công khai, mã chưa đủ điều kiện hiện mờ kèm lý do
export function listCoupons(lines: QuoteLine[], shippingFee: number, lookup: Lookup, ctx: { phone?: string; email?: string; now: Date }) {
  return lookup.coupons.filter((c) => c.isPublic).map((c) => {
    const r = evaluateCoupon(c.code, lines, shippingFee, lookup, ctx);
    return { code: c.code, title: c.title, endsAt: c.endsAt, minSubtotal: c.minSubtotal, type: c.type,
      ok: r.status === "applied", error: r.status === "invalid" ? r.error : undefined, shortfall: r.status === "invalid" ? r.shortfall : undefined,
      saving: r.status === "applied" ? r.discount + r.shippingDiscount : 0 };
  });
}

// Tiền theo III.3 BRD: Tổng = Tạm tính − Giảm giá + Phí ship; VAT tách ra từ Tổng
export function computeMoney(lines: QuoteLine[], pkg: ShippingPackage | undefined, coupon: CouponResult | undefined, s: Settings): Money {
  const subtotal = lines.reduce((t, l) => t + l.lineTotal, 0);
  const discount = coupon?.status === "applied" ? coupon.discount : 0;
  const rawFee = pkg?.fee ?? 0;
  const freeByThreshold = subtotal - discount >= s.freeshipThreshold;
  const shippingFee = freeByThreshold ? 0 : rawFee;
  const shippingDiscount = coupon?.status === "applied" ? Math.min(coupon.shippingDiscount, shippingFee) : 0;
  const shippingPayable = Math.max(0, shippingFee - shippingDiscount);
  const total = Math.max(0, subtotal - discount + shippingPayable);
  const netAmount = Math.round(total / (1 + s.vatRate));
  return { subtotal, discount, shippingFee: rawFee, shippingDiscount: freeByThreshold ? rawFee : shippingDiscount, shippingPayable, total, vatRate: s.vatRate, netAmount, vatAmount: total - netAmount };
}
