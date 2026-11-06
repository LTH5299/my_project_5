import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { sweep } from "@/lib/orders";
import { devToolsEnabled } from "@/lib/devtools";

export const dynamic = "force-dynamic";

export function GET() {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  sweep();
  const s = db();
  return NextResponse.json({
    orders: s.orders.slice(0, 30).map((o) => ({
      code: o.code, token: o.token, method: o.method, status: o.status, paymentStatus: o.paymentStatus, total: o.total,
      createdAt: o.createdAt, expiresAt: o.sepay?.expiresAt, customer: o.customer.name, phone: o.customer.phone,
    })),
    unmatched: s.unmatched.slice(0, 30),
    outbox: s.outbox.slice(0, 40).map(({ html: _h, ...m }) => m),
    settings: s.settings,
    variants: s.products.flatMap((p) => p.variants.map((v) => ({ id: v.id, sku: v.sku, name: `${p.name.vi} (${v.color.vi}, ${v.size})`, stock: v.stock, price: v.price, active: v.active }))),
  });
}
