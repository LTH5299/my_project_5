import type { CartItem, Coupon, CouponUsage, Localized, Product, Variant } from "./types";
import { FREE_SHIPPING_THRESHOLD, findProvince, findWard, findZone } from "./data/locations";
import { MAX_QTY_PER_VARIANT } from "./data/catalog";

export const COD_LIMIT = 5000000; // REQ-A7.4.1: đơn trên 5.000.000đ khóa COD (đề xuất)

export type LineState = "ok" | "reduced" | "out_of_stock" | "inactive" | "missing";

export interface QuoteLine {
  variantId: string;
  productId: string;
  sku: string;
  name: Localized;
  color: Localized;
  size: string;
  swatch: string;
  image?: string;
  category: Product["category"];
  onSale: boolean;
  price: number;
  compareAt?: number;
  qty: number; // số lượng tính tiền
  requestedQty: number;
  available: number; // tối đa có thể mua (không lộ số tồn khi > giới hạn)
  lineTotal: number;
  state: LineState;
}

export type CouponError =
  | "not_found"
  | "not_started"
  | "expired"
  | "out_of_uses"
  | "used_by_customer"
  | "min_not_met"
  | "not_applicable";

export type CouponResult =
  | { status: "applied"; code: string; discount: number; shippingDiscount: number; type: Coupon["type"]; recheckOnPhone: boolean; description: Localized }
  | { status: "invalid"; code: string; error: CouponError; shortfall?: number };

export interface ShippingResult {
  status: "need_address" | "ok" | "unsupported";
  fee: number;
  freeByThreshold: boolean;
  eta?: Localized;
  freeThreshold: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  shipping: ShippingResult;
  coupon?: CouponResult;
  discount: number;
  shippingDiscount: number;
  shippingPayable: number;
  total: number;
  codAllowed: boolean;
  codLimit: number;
  hasBlockingLines: boolean;
}

export interface QuoteInput {
  items: CartItem[];
  provinceId?: string;
  wardId?: string;
  couponCode?: string;
  phone?: string;
  email?: string;
  now?: Date;
}

export interface CatalogLookup {
  findVariant(id: string): { product: Product; variant: Variant } | undefined;
  coupons: Coupon[];
  couponUsage: CouponUsage[];
}

export function buildLines(items: CartItem[], lookup: CatalogLookup): QuoteLine[] {
  const merged = new Map<string, number>();
  for (const it of items) {
    const q = Math.floor(Number(it.qty));
    if (!it.variantId || !Number.isFinite(q) || q < 1) continue;
    merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + q);
  }
  const lines: QuoteLine[] = [];
  for (const [variantId, requestedQty] of merged) {
    const found = lookup.findVariant(variantId);
    if (!found) {
      lines.push({
        variantId, productId: "", sku: "", name: { vi: "Sản phẩm không còn tồn tại", en: "Product no longer exists" },
        color: { vi: "", en: "" }, size: "", swatch: "#ccc", category: "nam", onSale: false,
        price: 0, qty: 0, requestedQty, available: 0, lineTotal: 0, state: "missing",
      });
      continue;
    }
    const { product, variant } = found;
    const available = Math.max(0, Math.min(variant.stock, MAX_QTY_PER_VARIANT));
    let state: LineState = "ok";
    let qty = Math.min(requestedQty, MAX_QTY_PER_VARIANT);
    if (!variant.active) { state = "inactive"; qty = 0; }
    else if (variant.stock <= 0) { state = "out_of_stock"; qty = 0; }
    else if (qty > variant.stock) { state = "reduced"; qty = variant.stock; }
    lines.push({
      variantId, productId: product.id, sku: variant.sku, name: product.name, color: variant.color, size: variant.size,
      swatch: variant.swatch, image: product.image, category: product.category, onSale: product.onSale, price: variant.price,
      compareAt: variant.compareAt, qty, requestedQty, available, lineTotal: qty * variant.price, state,
    });
  }
  return lines;
}

export function quoteShipping(subtotal: number, provinceId?: string, wardId?: string): ShippingResult {
  const base = { fee: 0, freeByThreshold: false, freeThreshold: FREE_SHIPPING_THRESHOLD };
  if (!provinceId || !wardId || !findWard(provinceId, wardId)) return { status: "need_address", ...base };
  const zone = findZone(provinceId);
  if (!findProvince(provinceId) || !zone) return { status: "unsupported", ...base };
  const freeByThreshold = subtotal >= FREE_SHIPPING_THRESHOLD;
  return { status: "ok", fee: freeByThreshold ? 0 : zone.fee, freeByThreshold, eta: zone.eta, freeThreshold: FREE_SHIPPING_THRESHOLD };
}

export function countActiveUses(usage: CouponUsage[], code: string) {
  return usage.filter((u) => u.active && u.code === code).length;
}

export function countCustomerUses(usage: CouponUsage[], code: string, phone?: string, email?: string) {
  const em = email?.trim().toLowerCase();
  return usage.filter((u) => u.active && u.code === code && ((phone && u.phone === phone) || (em && u.email === em))).length;
}

export function evaluateCoupon(
  rawCode: string,
  lines: QuoteLine[],
  subtotal: number,
  shippingFee: number,
  lookup: CatalogLookup,
  ctx: { phone?: string; email?: string; now: Date },
): CouponResult {
  const code = rawCode.trim().toUpperCase();
  const c = lookup.coupons.find((x) => x.code === code);
  if (!c) return { status: "invalid", code, error: "not_found" };
  const now = ctx.now.getTime();
  if (now < Date.parse(c.startsAt)) return { status: "invalid", code, error: "not_started" };
  // Quy ước: đến đúng thời điểm kết thúc là hết hiệu lực
  if (now >= Date.parse(c.endsAt)) return { status: "invalid", code, error: "expired" };
  if (countActiveUses(lookup.couponUsage, code) >= c.totalLimit) return { status: "invalid", code, error: "out_of_uses" };

  const eligible = lines.filter(
    (l) => l.qty > 0 && (!c.categories || c.categories.includes(l.category)) && !(c.excludeSale && l.onSale),
  );
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.lineTotal, 0);
  if (eligibleSubtotal <= 0) return { status: "invalid", code, error: "not_applicable" };
  if (subtotal < c.minSubtotal) return { status: "invalid", code, error: "min_not_met", shortfall: c.minSubtotal - subtotal };

  const hasIdentity = Boolean(ctx.phone || ctx.email);
  if (hasIdentity && countCustomerUses(lookup.couponUsage, code, ctx.phone, ctx.email) >= c.perCustomerLimit) {
    return { status: "invalid", code, error: "used_by_customer" };
  }

  let discount = 0;
  let shippingDiscount = 0;
  if (c.type === "percent") {
    discount = Math.floor((eligibleSubtotal * c.value) / 100);
    if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  } else if (c.type === "fixed") {
    discount = c.value;
  } else {
    shippingDiscount = shippingFee; // mã freeship chỉ trừ vào phí ship
  }
  discount = Math.min(discount, subtotal); // số tiền giảm không vượt tạm tính
  return {
    status: "applied", code, discount, shippingDiscount, type: c.type,
    recheckOnPhone: !ctx.phone && c.perCustomerLimit > 0, description: c.description,
  };
}

export function computeQuote(input: QuoteInput, lookup: CatalogLookup): Quote {
  const now = input.now ?? new Date();
  const lines = buildLines(input.items, lookup);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipping = quoteShipping(subtotal, input.provinceId, input.wardId);
  let coupon: CouponResult | undefined;
  let discount = 0;
  let shippingDiscount = 0;
  if (input.couponCode && input.couponCode.trim()) {
    coupon = evaluateCoupon(input.couponCode, lines, subtotal, shipping.fee, lookup, { phone: input.phone, email: input.email, now });
    if (coupon.status === "applied") {
      discount = coupon.discount;
      shippingDiscount = coupon.shippingDiscount;
    }
  }
  const shippingPayable = Math.max(0, shipping.fee - shippingDiscount);
  const total = Math.max(0, subtotal - discount + shippingPayable);
  return {
    lines, subtotal, shipping, coupon, discount, shippingDiscount, shippingPayable, total,
    codAllowed: total <= COD_LIMIT, codLimit: COD_LIMIT,
    hasBlockingLines: lines.some((l) => l.state === "out_of_stock" || l.state === "inactive" || l.state === "missing"),
  };
}
