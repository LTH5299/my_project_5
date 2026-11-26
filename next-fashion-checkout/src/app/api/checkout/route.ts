import { NextResponse } from "next/server";
import { submitCheckout, type CheckoutInput } from "@/lib/orders";
import { body, currentMemberId } from "@/lib/api";

export const dynamic = "force-dynamic";

// Bấm "Đặt hàng" (COD → tạo đơn) hoặc "Thanh toán" (SePay → tạo phiên NFP giữ hàng 15 phút)
export async function POST(req: Request) {
  const b = await body<CheckoutInput>(req);
  if (!b.idempotencyKey || !b.seen || !b.customer || !b.address) return NextResponse.json({ status: "error", error: "bad_request" }, { status: 400 });
  const memberId = await currentMemberId();
  const r = submitCheckout({ ...b, memberId, saveProfile: Boolean(memberId && b.saveProfile) });
  return NextResponse.json(r, { status: r.status === "invalid" ? 422 : 200 });
}
