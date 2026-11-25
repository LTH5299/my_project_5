import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { currentMemberId } from "@/lib/api";

export const dynamic = "force-dynamic";

// "Đơn hàng của tôi" cho thành viên
export async function GET() {
  const id = await currentMemberId();
  if (!id) return NextResponse.json({ orders: [] }, { status: 401 });
  const orders = db().orders.filter((o) => o.memberId === id).map((o) => ({
    code: o.code, token: o.token, createdAt: o.createdAt, status: o.status, total: o.money.total, count: o.items.reduce((t, i) => t + i.qty, 0), method: o.method,
  }));
  return NextResponse.json({ orders });
}
