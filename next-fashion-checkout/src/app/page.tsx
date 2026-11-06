"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Footer, Thumb, TopBar } from "@/components/Chrome";
import { CrossIcon } from "@/components/Icons";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import { useCart } from "@/lib/cart";
import type { Localized } from "@/lib/types";

type PV = { id: string; sku: string; color: Localized; swatch: string; size: string; price: number; compareAt?: number; available: number };
type PP = { id: string; name: Localized; image?: string; category: string; onSale: boolean; variants: PV[] };

export default function ShopPage() {
  return <Suspense><Shop /></Suspense>;
}

const CATS = ["all", "nu", "nam", "phu-kien"] as const;

function Shop() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const cat = (useSearchParams().get("c") ?? "all") as (typeof CATS)[number];
  const { items, update } = useCart();
  const [products, setProducts] = useState<PP[] | null>(null);
  const [maxQty, setMaxQty] = useState(5);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<{ name: string; image?: string; variant: PV; qty: number; partial?: number; error?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((d) => { setProducts(d.products); setMaxQty(d.maxQty); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000); // mini-cart tự đóng sau 5 giây
    return () => clearTimeout(timer.current);
  }, [toast]);

  function add(p: PP, v: PV) {
    const inCart = items.find((i) => i.variantId === v.id)?.qty ?? 0;
    const room = Math.max(0, v.available - inCart);
    if (room <= 0) {
      setToast({ name: p.name[lang], variant: v, qty: 0, error: v.available === 0 ? L.shop.soldOut : fmt(L.shop.limitReached, { n: maxQty }) });
      return;
    }
    const next = items.some((i) => i.variantId === v.id)
      ? items.map((i) => (i.variantId === v.id ? { ...i, qty: i.qty + 1 } : i))
      : [...items, { variantId: v.id, qty: 1 }];
    update(next);
    setToast({ name: p.name[lang], image: p.image, variant: v, qty: 1 });
  }

  const shown = (products ?? []).filter((p) => cat === "all" || p.category === cat);

  return (
    <>
      <TopBar />
      <section className="hero" aria-labelledby="hero-title">
        <div className="container">
          <h1 id="hero-title">{L.shop.title}</h1>
          <div className="hero-side">
            <p>{L.shop.lead}</p>
            <a className="btn btn-light" href="#collection">{L.shop.explore}</a>
          </div>
        </div>
        <div className="hero-strip" aria-hidden="true">
          {products?.slice(0, 6).map((p) => <span key={p.id} style={{ background: p.variants[0]?.swatch }} />)}
        </div>
      </section>
      <main className="container" id="collection">
        <div className="shop-head">
          <h2>{cat === "all" ? L.shop.allProducts : cat === "nu" ? L.nav.women : cat === "nam" ? L.nav.men : L.nav.accessories}</h2>
          {products && <p>{fmt(L.shop.count, { n: shown.length })}</p>}
        </div>
        <div className="cat-tabs" role="group" aria-label={L.nav.menu}>
          {CATS.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => router.replace(c === "all" ? "/#collection" : `/?c=${c}#collection`, { scroll: false })}>
              {c === "all" ? L.shop.all : c === "nu" ? L.nav.women : c === "nam" ? L.nav.men : L.nav.accessories}
            </button>
          ))}
        </div>
        {failed && <p className="notice notice-error">{L.checkout.genericError}</p>}
        <div className="products" aria-busy={!products}>
          {!products && !failed && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product"><div className="product-img skeleton" /><div className="skeleton" style={{ height: 20, width: "60%" }} /></div>
          ))}
          {shown.map((p, i) => <ProductCard key={p.id} p={p} onAdd={add} priority={i < 3} />)}
        </div>
      </main>
      <Footer />
      {toast && (
        <div className="toast stock" role="status" aria-live="polite">
          <div className="toast-head">
            <strong>{toast.error ?? L.shop.added}</strong>
            <button type="button" className="link-btn" aria-label="Đóng" onClick={() => setToast(null)}><CrossIcon /></button>
          </div>
          {!toast.error && (
            <div className="line">
              <Thumb swatch={toast.variant.swatch} image={toast.image} qty={toast.qty} />
              <div><div className="line-name">{toast.name}</div><div className="line-meta">{toast.variant.color[lang]}, {sizeLabel(toast.variant.size, L.shop.size)}</div></div>
              <div className="line-price">{money(toast.variant.price)}</div>
            </div>
          )}
          <div className="actions">
            <Link href="/cart" className="btn btn-sm btn-quiet">{L.shop.viewCart}</Link>
            <Link href="/checkout" className="btn btn-sm">{L.shop.checkout}</Link>
          </div>
        </div>
      )}
    </>
  );
}

function ProductCard({ p, onAdd, priority }: { p: PP; onAdd: (p: PP, v: PV) => void; priority?: boolean }) {
  const { L, lang, money } = useLang();
  const firstAvailable = p.variants.find((v) => v.available > 0) ?? p.variants[0];
  const [sel, setSel] = useState(firstAvailable?.id);
  const v = p.variants.find((x) => x.id === sel) ?? firstAvailable;
  if (!v) return null;
  return (
    <article className="product">
      <div className="product-img" style={p.image ? undefined : { background: `linear-gradient(165deg, ${v.swatch}, color-mix(in oklab, ${v.swatch} 80%, black))` }}>
        {p.image && <img src={p.image} alt={`${p.name[lang]}, ${v.color[lang]}`} width={800} height={1000} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />}
        {p.onSale && <span className="tag tag-accent">{L.shop.sale}</span>}
      </div>
      <h3>{p.name[lang]}</h3>
      <div className="price">
        <span>{money(v.price)}</span>
        {v.compareAt && <s>{money(v.compareAt)}</s>}
      </div>
      <div className="swatches" role="group" aria-label={`${L.shop.color} / ${L.shop.size}`}>
        {p.variants.map((x) => (
          <button key={x.id} type="button" className="swatch-btn" aria-pressed={x.id === v.id} data-soldout={x.available === 0} onClick={() => setSel(x.id)}>
            <span className="chip" style={{ background: x.swatch }} />{x.color[lang]}, {x.size}
          </button>
        ))}
      </div>
      <button type="button" className="btn" disabled={v.available === 0} onClick={() => onAdd(p, v)}>
        {v.available === 0 ? L.shop.soldOut : L.shop.add}
      </button>
    </article>
  );
}
