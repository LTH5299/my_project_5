import { NextResponse } from "next/server";
import { quote } from "@/lib/orders";
import { normalizePhone, validatePhone, validateEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const phone = b.phone && !validatePhone(b.phone) ? normalizePhone(b.phone) : undefined;
  const email = b.email && !validateEmail(b.email) ? String(b.email).trim().toLowerCase() : undefined;
  const q = quote({ items: Array.isArray(b.items) ? b.items : [], provinceId: b.provinceId, wardId: b.wardId, couponCode: b.couponCode, phone, email });
  return NextResponse.json(q);
}
