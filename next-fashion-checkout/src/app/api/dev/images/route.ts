import { NextResponse } from "next/server";
import { db, save } from "@/lib/store";
import { SEED_PRODUCTS } from "@/lib/data/catalog";
import { devToolsEnabled } from "@/lib/devtools";
import { parseDataUrl, saveUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// Thay ảnh sản phẩm: { productId, dataUrl } để lưu ảnh mới, { productId, reset: true } để dùng lại ảnh minh họa.
export async function POST(req: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const product = db().products.find((p) => p.id === b.productId);
  if (!product) return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  if (b.reset) {
    product.image = SEED_PRODUCTS.find((p) => p.id === product.id)?.image;
    product.ownPhoto = false;
    save();
    return NextResponse.json({ ok: true, image: product.image });
  }
  const parsed = typeof b.dataUrl === "string" ? parseDataUrl(b.dataUrl) : null;
  if (!parsed) return NextResponse.json({ error: "bad_image" }, { status: 400 });
  const name = saveUpload(product.id, parsed.ext, parsed.bytes);
  product.image = `/api/images/${name}`;
  product.ownPhoto = true;
  save();
  return NextResponse.json({ ok: true, image: product.image });
}
