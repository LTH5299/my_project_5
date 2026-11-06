import { NextResponse } from "next/server";
import { DEMO_MEMBER } from "@/lib/data/coupons";

export const dynamic = "force-dynamic";

// Đăng nhập mẫu để thử sổ địa chỉ. Bản thật dùng luồng đăng nhập của A1.2.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const res = NextResponse.json({ member: b.action === "login" ? DEMO_MEMBER : null });
  if (b.action === "login") res.cookies.set("nf_member", DEMO_MEMBER.id, { httpOnly: true, sameSite: "lax", path: "/" });
  else res.cookies.delete("nf_member");
  return res;
}
