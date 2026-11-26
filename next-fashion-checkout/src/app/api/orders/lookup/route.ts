import { NextResponse } from "next/server";
import { accessOrder } from "@/lib/orders";
import { body } from "@/lib/api";

export const dynamic = "force-dynamic";

// Tra cứu đơn bằng mã đơn + SĐT; sai thì chỉ báo "Không tìm thấy đơn hàng"
export async function POST(req: Request) {
  const b = await body<{ code?: string; phone?: string }>(req);
  const o = b.code && b.phone ? accessOrder(String(b.code), { phone: String(b.phone) }) : undefined;
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ code: o.code, token: o.token });
}
