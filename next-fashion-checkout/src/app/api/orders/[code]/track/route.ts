import { NextResponse } from "next/server";
import { markPurchaseTracked } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Sự kiện Purchase chỉ ghi nhận 1 lần cho GA4/Meta Pixel (REQ-A7.6.1)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const b = await req.json().catch(() => ({}));
  return NextResponse.json({ first: markPurchaseTracked(code, String(b.token ?? "")) });
}
