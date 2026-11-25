import { db, save } from "./store";
import { quoteCheckout, type CheckoutQuote, type QuoteInput } from "./quote";

export const MAX_WRONG_ATTEMPTS = 5; // nhập sai 5 lần liên tiếp
export const LOCK_MS = 10 * 60 * 1000; // khóa ô nhập mã 10 phút

export type ApplyResult =
  | { status: "locked"; lockedUntil: string }
  | { status: "applied" | "invalid"; quote: CheckoutQuote; attemptsLeft: number; lockedUntil?: string };

// Áp mã gõ tay trong hộp thoại SCR-04. Chọn từ danh sách cũng đi qua đây nhưng không tính lượt sai.
export function applyCouponAttempt(clientId: string, input: QuoteInput & { couponCode: string; typed: boolean }, now = new Date()): ApplyResult {
  const store = db();
  const f = store.couponFailures[clientId] ?? { count: 0 };
  if (input.typed && f.lockedUntil && Date.parse(f.lockedUntil) > now.getTime()) return { status: "locked", lockedUntil: f.lockedUntil };
  if (f.lockedUntil && Date.parse(f.lockedUntil) <= now.getTime()) { f.lockedUntil = undefined; f.count = 0; }

  const q = quoteCheckout({ ...input, now });
  if (q.coupon?.status === "applied") {
    store.couponFailures[clientId] = { count: 0 };
    save();
    return { status: "applied", quote: q, attemptsLeft: MAX_WRONG_ATTEMPTS };
  }
  if (input.typed) {
    f.count += 1;
    if (f.count >= MAX_WRONG_ATTEMPTS) { f.lockedUntil = new Date(now.getTime() + LOCK_MS).toISOString(); f.count = 0; }
    store.couponFailures[clientId] = f;
    save();
  }
  return { status: "invalid", quote: q, attemptsLeft: f.lockedUntil ? 0 : MAX_WRONG_ATTEMPTS - f.count, lockedUntil: f.lockedUntil };
}
