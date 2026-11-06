import { NextResponse } from "next/server";
import { applyCouponAttempt } from "@/lib/couponGuard";
import { normalizePhone, validatePhone, validateEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const code = String(b.code ?? "").trim();
  if (!code) return NextResponse.json({ status: "empty" }, { status: 400 });
  const phone = b.phone && !validatePhone(b.phone) ? normalizePhone(b.phone) : undefined;
  const email = b.email && !validateEmail(b.email) ? String(b.email).trim().toLowerCase() : undefined;
  const r = applyCouponAttempt(String(b.clientId ?? "anonymous"), {
    items: Array.isArray(b.items) ? b.items : [], provinceId: b.provinceId, wardId: b.wardId, couponCode: code, phone, email, appliedCode: b.appliedCode || undefined,
  });
  return NextResponse.json(r);
}
