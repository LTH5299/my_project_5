"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Footer, TopBar } from "@/components/Chrome";
import type { Localized } from "@/lib/types";

type P = { id: string; name: Localized; image?: string; ownPhoto?: boolean; variants: { sku: string; color: Localized }[] };
const W = 800, H = 1000; // khung dọc 4:5 dùng trên toàn trang

// Trang để shop tự thay ảnh sản phẩm, không cần sửa code.
export default function ImagesPage() {
  const [products, setProducts] = useState<P[] | null>(null);
  const load = () => fetch("/api/catalog", { cache: "no-store" }).then((r) => r.json()).then((d) => setProducts(d.products));
  useEffect(() => { load(); }, []);
  return (
    <>
      <TopBar />
      <main className="container dev">
        <div className="page-head" style={{ paddingBottom: 0 }}>
          <h1>Ảnh sản phẩm</h1>
          <p>Chọn ảnh từ máy, kéo thanh trượt để căn khung 4:5, rồi bấm Lưu ảnh. Ảnh mới hiện ngay ở cửa hàng, giỏ hàng và trang thanh toán. Đơn đã đặt vẫn giữ ảnh lúc đặt.</p>
          <p><Link href="/">Xem cửa hàng</Link></p>
        </div>
        <div className="img-grid">
          {products?.map((p) => <ImageCard key={p.id} p={p} onSaved={load} />)}
        </div>
      </main>
      <Footer slim />
    </>
  );
}

function ImageCard({ p, onSaved }: { p: P; onSaved: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fx, setFx] = useState(50);
  const [fy, setFy] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const canvas = useRef<HTMLCanvasElement>(null);

  function pick(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setState({ kind: "error", text: "Chỉ nhận ảnh JPG, PNG hoặc WEBP." }); return; }
    if (file.size > 20 * 1024 * 1024) { setState({ kind: "error", text: "Ảnh quá lớn, tối đa 20 MB." }); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setFx(50); setFy(50); setZoom(100); setState({ kind: "idle" }); };
    im.onerror = () => setState({ kind: "error", text: "Không đọc được ảnh này." });
    im.src = url;
  }

  // Cắt khung 4:5 theo điểm lấy nét và mức phóng
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    const cover = Math.max(W / img.width, H / img.height) * (zoom / 100);
    const sw = W / cover, sh = H / cover;
    const sx = (img.width - sw) * (fx / 100), sy = (img.height - sh) * (fy / 100);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }, [img, fx, fy, zoom]);

  async function saveImage() {
    if (!canvas.current) return;
    setState({ kind: "saving" });
    const dataUrl = canvas.current.toDataURL("image/jpeg", 0.86);
    const r = await fetch("/api/dev/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, dataUrl }) })
      .then((x) => x.json()).catch(() => ({ error: "network" }));
    if (r.ok) { setState({ kind: "saved", text: "Đã lưu. Ảnh mới đang hiển thị trên cửa hàng." }); setImg(null); onSaved(); }
    else setState({ kind: "error", text: r.error === "bad_image" ? "Ảnh không hợp lệ hoặc lớn hơn 4 MB sau khi cắt." : "Chưa lưu được, vui lòng thử lại." });
  }

  async function reset() {
    const r = await fetch("/api/dev/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: p.id, reset: true }) }).then((x) => x.json());
    if (r.ok) { setState({ kind: "saved", text: "Đã dùng lại ảnh minh họa." }); onSaved(); }
  }

  const id = `file-${p.id}`;
  return (
    <section className="stock img-card">
      <div className="img-frame">
        {img ? <canvas ref={canvas} width={W} height={H} aria-label={`Xem trước ảnh mới của ${p.name.vi}`} />
          : p.image ? <img src={p.image} alt={p.name.vi} width={W} height={H} /> : null}
      </div>
      <div className="img-body">
        <h2>{p.name.vi}</h2>
        <p className="line-meta">{p.variants.map((v) => v.sku).join(", ")}</p>
        <p className="line-meta">{p.ownPhoto ? "Đang dùng ảnh của shop" : "Đang dùng ảnh minh họa"}</p>
        <label className="btn btn-quiet btn-sm" htmlFor={id}>Chọn ảnh từ máy</label>
        <input id={id} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
        {img && (
          <div className="stack" style={{ gap: 8 }}>
            <label className="field"><span className="label">Căn ngang</span><input type="range" min={0} max={100} value={fx} onChange={(e) => setFx(+e.target.value)} /></label>
            <label className="field"><span className="label">Căn dọc</span><input type="range" min={0} max={100} value={fy} onChange={(e) => setFy(+e.target.value)} /></label>
            <label className="field"><span className="label">Phóng to</span><input type="range" min={100} max={250} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
            <div className="row-actions">
              <button type="button" className="btn btn-sm" onClick={saveImage} disabled={state.kind === "saving"}>{state.kind === "saving" ? "Đang lưu…" : "Lưu ảnh"}</button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setImg(null)}>Hủy</button>
            </div>
          </div>
        )}
        {!img && p.ownPhoto && <button type="button" className="link-btn" onClick={reset}>Dùng lại ảnh minh họa</button>}
        {state.text && <p className={state.kind === "error" ? "error-text" : "help"} role="status">{state.text}</p>}
      </div>
    </section>
  );
}
