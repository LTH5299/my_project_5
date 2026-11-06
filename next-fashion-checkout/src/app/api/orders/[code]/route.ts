import { NextResponse } from "next/server";
import { getOrder, publicOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const o = getOrder(code, token);
  if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ order: publicOrder(o), serverNow: new Date().toISOString() });
}
