import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { MAX_QTY_PER_VARIANT } from "@/lib/data/catalog";
import { publicSettings } from "@/lib/api";

export const dynamic = "force-dynamic";

// Không trả số tồn chính xác ra ngoài, chỉ trả số tối đa có thể mua = min(tồn, 10)
export function GET() {
  const products = db().products.map((p) => ({
    ...p,
    variants: p.variants.filter((v) => v.active).map(({ stock, ...v }) => ({ ...v, available: Math.max(0, Math.min(stock, MAX_QTY_PER_VARIANT)) })),
  }));
  return NextResponse.json({ products, maxQty: MAX_QTY_PER_VARIANT, settings: publicSettings() });
}
