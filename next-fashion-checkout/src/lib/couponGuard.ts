import { db, save } from "./store";
import { quote } from "./orders";
import type { QuoteInput, Quote } from "./pricing";

export const MAX_WRONG_ATTEMPTS = 5; // REQ-A7.3.2: sai 5 lần liên tiếp
export const LOCK_MS = 10 * 60 * 1000; // khóa ô nhập mã 10 phút (đề xuất)

export type ApplyResult =
  | { status: "locked"; lockedUntil: string }
  | { status: "applied" | "invalid"; quote: Quote; attemptsLeft: number; lockedUntil?: string }
  | { status: "already_applied"; code: string };

// Áp mã từ ô nhập: đếm số lần sai liên tiếp theo phiên của khách để chống dò mã.
export function applyCouponAttempt(clientId: string, input: QuoteInput & { appliedCode?: string }, now = new Date()): ApplyResult {
  const store = db();
  // Mỗi đơn chỉ áp 1 mã: đã có mã thì phải gỡ trước (US-07 AC-4)
  if (input.appliedCode) return { status: "already_applied", code: input.appliedCode };
  const f = store.couponFailures[clientId] ?? { count: 0 };
  if (f.lockedUntil && Date.parse(f.lockedUntil) > now.getTime()) return { status: "locked", lockedUntil: f.lockedUntil };
  if (f.lockedUntil) { f.lockedUntil = undefined; f.count = 0; }

  const q = quote({ ...input, now });
  if (q.coupon?.status === "applied") {
    store.couponFailures[clientId] = { count: 0 };
    save();
    return { status: "applied", quote: q, attemptsLeft: MAX_WRONG_ATTEMPTS };
  }
  f.count += 1;
  if (f.count >= MAX_WRONG_ATTEMPTS) {
    f.lockedUntil = new Date(now.getTime() + LOCK_MS).toISOString();
    f.count = 0;
  }
  store.couponFailures[clientId] = f;
  save();
  return { status: "invalid", quote: q, attemptsLeft: f.lockedUntil ? 0 : MAX_WRONG_ATTEMPTS - f.count, lockedUntil: f.lockedUntil };
}
