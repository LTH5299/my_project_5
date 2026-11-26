import type { CartItem, Money, ShippingPackage } from "./types";
import { db, findVariant } from "./store";
import { buildLines, cartWeight, computeMoney, evaluateCoupon, hasBlocking, listCoupons, type CouponResult, type Lookup, type QuoteLine } from "./pricing";
import { quoteShipping, type QuoteResult } from "./shipping";

export const lookup = (): Lookup => ({ findVariant, coupons: db().coupons, couponUsage: db().couponUsage });

export interface QuoteInput {
  items: CartItem[];
  provinceId?: string;
  wardId?: string;
  pkgId?: string;
  couponCode?: string;
  phone?: string;
  email?: string;
  now?: Date;
}

export interface CheckoutQuote {
  lines: QuoteLine[];
  blocking: boolean;
  weightGrams: number;
  shipping?: QuoteResult;
  pkg?: ShippingPackage;
  coupon?: CouponResult;
  money: Money;
  codAllowed: boolean;
  sepayAvailable: boolean;
  freeshipRemaining: number;
}

// Một lần tính đầy đủ cho đơn: dòng hàng → báo phí → mã → tiền (dùng cho cả hiển thị lẫn kiểm tra lại lúc bấm đặt)
export function quoteCheckout(input: QuoteInput): CheckoutQuote {
  const now = input.now ?? new Date();
  const s = db().settings;
  const lk = lookup();
  const lines = buildLines(input.items ?? [], lk);
  const weightGrams = cartWeight(lines);
  let shipping: QuoteResult | undefined;
  let pkg: ShippingPackage | undefined;
  if (input.provinceId && input.wardId) {
    shipping = quoteShipping(input.provinceId, input.wardId, weightGrams, s, now);
    pkg = shipping.packages.find((p) => p.id === input.pkgId) ?? shipping.packages.find((p) => p.cheapest);
  }
  const coupon = input.couponCode
    ? evaluateCoupon(input.couponCode, lines, pkg?.fee ?? 0, lk, { phone: input.phone, email: input.email, now })
    : undefined;
  const money = computeMoney(lines, pkg, coupon, s);
  return {
    lines, blocking: hasBlocking(lines), weightGrams, shipping, pkg, coupon, money,
    codAllowed: money.total <= s.codCap,
    sepayAvailable: !s.sepayDisabled,
    freeshipRemaining: Math.max(0, s.freeshipThreshold - (money.subtotal - money.discount)),
  };
}

export function couponList(input: QuoteInput) {
  const q = quoteCheckout({ ...input, couponCode: undefined });
  return listCoupons(q.lines, q.pkg?.fee ?? 0, lookup(), { phone: input.phone, email: input.email, now: input.now ?? new Date() });
}

// Những gì khách đã nhìn thấy ở Bước 4, để so lúc bấm đặt (BR-06 / MSG-04)
export interface SeenMoney {
  subtotal: number; discount: number; shippingPayable: number; total: number; vatRate: number; pkgFee: number;
  lines: { variantId: string; qty: number; price: number }[];
}

export type ChangeKind = "stock" | "price" | "coupon" | "shipping" | "vat" | "total";
export interface Change { kind: ChangeKind; step: 2 | 3 | 4 | 0; detail?: string }

export function diffSeen(q: CheckoutQuote, seen: SeenMoney, couponCode?: string): Change[] {
  const out: Change[] = [];
  for (const l of seen.lines) {
    const ql = q.lines.find((x) => x.variantId === l.variantId);
    if (!ql || ql.state !== "ok" || ql.qty < l.qty) out.push({ kind: "stock", step: 0, detail: ql ? `${ql.name.vi} – ${ql.color.vi}/${ql.size}` : l.variantId });
    else if (ql.price !== l.price) out.push({ kind: "price", step: 4, detail: `${ql.name.vi}: ${l.price} → ${ql.price}` });
  }
  if (couponCode && q.coupon?.status !== "applied") out.push({ kind: "coupon", step: 2, detail: couponCode });
  else if (couponCode && q.money.discount !== seen.discount) out.push({ kind: "coupon", step: 2, detail: `${seen.discount} → ${q.money.discount}` });
  if (!q.pkg || q.pkg.fee !== seen.pkgFee || q.money.shippingPayable !== seen.shippingPayable) out.push({ kind: "shipping", step: 2, detail: `${seen.shippingPayable} → ${q.money.shippingPayable}` });
  if (q.money.vatRate !== seen.vatRate) out.push({ kind: "vat", step: 4, detail: `${seen.vatRate * 100}% → ${q.money.vatRate * 100}%` });
  if (!out.length && q.money.total !== seen.total) out.push({ kind: "total", step: 4, detail: `${seen.total} → ${q.money.total}` });
  return out;
}
