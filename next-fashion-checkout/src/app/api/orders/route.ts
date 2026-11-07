import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { placeOrder, publicOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 8) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const member = (await cookies()).get("nf_member")?.value;
  try {
    const r = await placeOrder({
      idempotencyKey: b.idempotencyKey,
      items: Array.isArray(b.items) ? b.items : [],
      contact: {
        name: String(b.contact?.name ?? ""), phone: String(b.contact?.phone ?? ""), email: String(b.contact?.email ?? ""),
        provinceId: String(b.contact?.provinceId ?? ""), wardId: String(b.contact?.wardId ?? ""), line: String(b.contact?.line ?? ""), note: String(b.contact?.note ?? ""),
      },
      couponCode: b.couponCode || undefined,
      method: b.method,
      agreedTerms: b.agreedTerms === true,
      lang: b.lang === "en" ? "en" : "vi",
      memberId: member === "m-demo" ? member : undefined,
      expected: b.expected ?? { total: -1, shippingFee: -1, discount: -1, lines: [] },
    });
    if (r.ok) return NextResponse.json({ ok: true, code: r.order.code, token: r.order.token, method: r.order.method, order: publicOrder(r.order) });
    return NextResponse.json(r, { status: r.error === "validation" ? 422 : 409 });
  } catch {
    // Lỗi giữa chừng: không trừ tồn, không tạo đơn dở dang (phần trừ tồn chạy đồng bộ một lượt)
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
