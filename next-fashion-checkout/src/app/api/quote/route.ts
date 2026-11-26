import { NextResponse } from "next/server";
import { quoteCheckout, type QuoteInput } from "@/lib/quote";
import { tick } from "@/lib/orders";
import { body } from "@/lib/api";

export const dynamic = "force-dynamic";

// Tính giỏ, báo phí GHN/VTP, áp mã, tách VAT (Bước 2–4)
export async function POST(req: Request) {
  const b = await body<QuoteInput>(req);
  tick();
  return NextResponse.json(quoteCheckout({ ...b, items: Array.isArray(b.items) ? b.items : [], now: undefined }));
}
