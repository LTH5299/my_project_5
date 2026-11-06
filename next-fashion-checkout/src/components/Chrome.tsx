"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt, useLang } from "@/lib/i18n/client";
import { formatVnd } from "@/lib/money";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/data/locations";
import { PHOTO_CREDITS } from "@/lib/data/photoCredits";
import { useCart } from "@/lib/cart";
import { BagIcon, LockIcon } from "./Icons";

export function LangSwitch() {
  const { lang, setLang, L } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label={L.nav.lang}>
      <button type="button" aria-pressed={lang === "vi"} onClick={() => setLang("vi")} lang="vi">VI</button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">EN</button>
    </div>
  );
}

export function TopBar({ mode = "shop" }: { mode?: "shop" | "checkout" }) {
  const { L, lang } = useLang();
  const { count } = useCart();
  const dev = process.env.NODE_ENV !== "production";
  return (
    <>
      {dev && (
        <div className="devbar">
          <div className="container">
            <span>{L.dev.banner}</span>
            <Link href="/dev">{L.dev.openSimulator}</Link>
          </div>
        </div>
      )}
      {mode === "shop" && (
        <div className="announce">
          <div className="container">
            <span>{fmt(L.announce.freeShip, { amount: formatVnd(FREE_SHIPPING_THRESHOLD, lang) })}</span>
            <span className="extra">{L.announce.payment}</span>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="container">
          <nav className="topbar-left" aria-label={L.nav.menu}>
            {mode === "checkout" ? (
              <Link href="/cart" className="back-link" aria-label={L.nav.backToCart}><span className="chev-left" aria-hidden="true" /><span className="back-text">{L.nav.backToCart}</span></Link>
            ) : (
              <>
                <Link href="/?c=nu" className="nav-link">{L.nav.women}</Link>
                <Link href="/?c=nam" className="nav-link">{L.nav.men}</Link>
                <Link href="/?c=phu-kien" className="nav-link">{L.nav.accessories}</Link>
              </>
            )}
          </nav>
          <Link href="/" className="wordmark" aria-label="Next Fashion">Next Fashion</Link>
          <div className="topbar-right">
            {mode === "checkout" ? (
              <span className="secure"><LockIcon /><span>{L.nav.secure}</span></span>
            ) : (
              <Link href="/cart" className="cart-link" aria-label={`${L.nav.cart}${count ? ` (${count})` : ""}`}>
                <BagIcon /><span className="cart-label">{L.nav.cart}</span>
                {count > 0 && <span className="cart-count" aria-hidden="true">{count}</span>}
              </Link>
            )}
            <LangSwitch />
          </div>
        </div>
      </header>
    </>
  );
}

const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "1900 0000";

function useImagesInUse() {
  const [images, setImages] = useState<string[] | null>(null);
  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then((d) => setImages(d.products.map((p: { image?: string }) => p.image ?? ""))).catch(() => setImages(null));
  }, []);
  return images;
}

export function Footer({ slim = false }: { slim?: boolean }) {
  const { L, lang } = useLang();
  const inUse = useImagesInUse();
  // Chỉ ghi nguồn cho ảnh minh họa còn đang dùng; ảnh shop tự chụp không cần ghi
  const credits = PHOTO_CREDITS.filter((c) => !inUse || inUse.includes(`/products/${c.image}.jpg`));
  const policies = (
    <>
      <li><a href="/policies/terms" target="_blank" rel="noopener">{L.footer.terms}</a></li>
      <li><a href="/policies/returns" target="_blank" rel="noopener">{L.footer.returns}</a></li>
      <li><a href="/policies/privacy" target="_blank" rel="noopener">{L.footer.privacy}</a></li>
    </>
  );
  if (slim) {
    return (
      <footer className="footer slim">
        <div className="container">
          <span>© Next Fashion</span>
          <nav aria-label={L.footer.policies}><ul className="inline-list">{policies}<li><a href="/help/payment" target="_blank" rel="noopener">{L.footer.faq}</a></li></ul></nav>
        </div>
      </footer>
    );
  }
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-brand">
          <span className="wordmark">Next Fashion</span>
          <p>{L.footer.tagline}</p>
        </div>
        <div>
          <h2>{L.footer.help}</h2>
          <ul>
            <li><a href={`tel:${HOTLINE.replace(/\s/g, "")}`}>{fmt(L.order.hotline, { phone: HOTLINE })}</a></li>
            <li><a href="/help/payment">{L.footer.faq}</a></li>
          </ul>
        </div>
        <div>
          <h2>{L.footer.policies}</h2>
          <ul>{policies}</ul>
        </div>
        <div>
          <h2>{L.footer.payWith}</h2>
          <ul>
            <li>{L.order.methods.cod}</li>
            <li>{L.checkout.sepay}</li>
          </ul>
        </div>
        <div className="footer-base">
          <span>© Next Fashion</span>
          <span>{L.footer.secureNote}</span>
        </div>
        {credits.length > 0 && <p className="photo-credits">
          {L.footer.photos}{" "}
          {credits.map((c, i) => (
            <span key={c.image}>
              <a href={c.page} target="_blank" rel="noopener">{c.author}</a>, <a href={c.licenseUrl} target="_blank" rel="noopener">{c.license}</a> ({c.changes[lang]}){i < credits.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>}
      </div>
    </footer>
  );
}

export function Thumb({ swatch, image, qty, label }: { swatch: string; image?: string; qty?: number; label?: string }) {
  // Ảnh sản phẩm; chưa có ảnh thì dùng ô màu theo màu vải của biến thể
  return (
    <div className="thumb" style={image ? undefined : { background: `linear-gradient(160deg, ${swatch}, color-mix(in oklab, ${swatch} 78%, black))` }} role={image ? undefined : "img"} aria-label={image ? undefined : label ?? ""}>
      {image && <img src={image} alt="" width={160} height={200} loading="lazy" decoding="async" />}
      {qty != null && <span className="qty">{qty}</span>}
    </div>
  );
}

export function Stepper({ current }: { current: 0 | 1 | 2 | 3 | 4 }) {
  const { L } = useLang();
  const steps = [L.steps.cart, L.steps.info, L.steps.shipping, L.steps.payment, L.steps.review];
  return (
    <ol className="stepper" aria-label="Các bước thanh toán">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        const inner = (<><span className="dot">{i + 1}</span><span className="label">{s}</span></>);
        return (
          <li key={s} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            {i === 0 ? <Link href="/cart">{inner}</Link> : inner}
          </li>
        );
      })}
    </ol>
  );
}
