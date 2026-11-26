import { NextResponse } from "next/server";
import { couponList, type QuoteInput } from "@/lib/quote";
import { applyCouponAttempt } from "@/lib/couponGuard";
import { body } from "@/lib/api";

export const dynamic = "force-dynamic";

// Hộp thoại SCR-04: danh sách mã công khai + áp mã (gõ tay sai 5 lần → khóa 10 phút)
export async function POST(req: Request) {
  const b = await body<QuoteInput & { action?: string; clientId?: string; typed?: boolean }>(req);
  const input = { ...b, items: Array.isArray(b.items) ? b.items : [], now: undefined };
  if (b.action === "list") return NextResponse.json({ coupons: couponList(input) });
  if (!b.couponCode || !String(b.couponCode).trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  return NextResponse.json(applyCouponAttempt(String(b.clientId ?? "anonymous"), { ...input, couponCode: String(b.couponCode), typed: Boolean(b.typed) }));
}
