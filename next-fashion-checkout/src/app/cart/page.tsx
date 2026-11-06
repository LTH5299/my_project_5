"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Footer, Stepper, Thumb, TopBar } from "@/components/Chrome";
import { AlertIcon } from "@/components/Icons";
import { CouponBox, type CouponMsg } from "@/components/CouponBox";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import { useCart } from "@/lib/cart";
import type { Quote, QuoteLine } from "@/lib/pricing";

const PRICE_KEY = "nf_cart_prices";
const FORM_KEY = "nf_checkout_form";

// Mã áp ở giỏ được chuyển sang trang thanh toán qua phiên làm việc
function readSavedCoupon(): string | undefined {
  try { return JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}").coupon; } catch { return undefined; }
}
function saveCoupon(code?: string) {
  try {
    const cur = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}");
    sessionStorage.setItem(FORM_KEY, JSON.stringify({ ...cur, coupon: code }));
  } catch { /* bỏ qua */ }
}
const MAX = 5;

function readPrices(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}"); } catch { return {}; }
}

function CartInner() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const soldOutParam = params.get("soldout")?.split(",") ?? [];
  const { items, ready, update } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState(false);
  const [priceChanged, setPriceChanged] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponMsg, setCouponMsg] = useState<CouponMsg>(null);
  useEffect(() => { setCoupon(readSavedCoupon()); }, []);

  useEffect(() => {
    if (!ready) return;
    if (!items.length) { setQuote(null); return; }
    let alive = true;
    fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items, couponCode: coupon }) })
      .then((r) => r.json())
      .then((q: Quote) => {
        if (!alive) return;
        setError(false);
        setQuote(q);
        // Đổi giỏ khiến mã không còn đủ điều kiện: tự gỡ và báo lý do (REQ-A7.3.3)
        if (coupon && q.coupon?.status === "invalid") {
          setCouponMsg({ kind: "error", text: fmt(L.coupon.autoRemoved, { code: q.coupon.code, reason: fmt(L.coupon.errors[q.coupon.error], { amount: money(q.coupon.shortfall ?? 0) }) }) });
          setCoupon(undefined); saveCoupon(undefined);
        }
        // Mỗi lần mở giỏ: kiểm tra lại tồn, giá, trạng thái bán (REQ-A6.3.1)
        const prices = readPrices();
        const changed = q.lines.filter((l) => prices[l.variantId] != null && prices[l.variantId] !== l.price).map((l) => l.variantId);
        setPriceChanged(changed);
        const nextPrices: Record<string, number> = {};
        q.lines.forEach((l) => (nextPrices[l.variantId] = l.price));
        try { localStorage.setItem(PRICE_KEY, JSON.stringify(nextPrices)); } catch { /* bỏ qua */ }
        const reduced = q.lines.filter((l) => l.state === "reduced");
        if (reduced.length) {
          setNotes((n) => ({ ...n, ...Object.fromEntries(reduced.map((l) => [l.variantId, fmt(L.cart.reduced, { n: l.qty })])) }));
          update(items.map((i) => { const r = reduced.find((x) => x.variantId === i.variantId); return r ? { ...i, qty: r.qty } : i; }));
        }
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(items), coupon]);

  function setQty(line: QuoteLine, qty: number) {
    if (!Number.isFinite(qty) || qty < 1) qty = 1; // nhập 0, số âm hoặc ký tự → trả về 1
    const cap = Math.min(MAX, line.available || MAX);
    if (qty > cap) {
      setNotes((n) => ({ ...n, [line.variantId]: line.available < MAX ? fmt(L.cart.reduced, { n: cap }) : fmt(L.shop.limitReached, { n: MAX }) }));
      qty = cap;
    } else setNotes((n) => { const { [line.variantId]: _, ...rest } = n; return rest; });
    update(items.map((i) => (i.variantId === line.variantId ? { ...i, qty } : i)));
  }
  function remove(variantId: string) {
    update(items.filter((i) => i.variantId !== variantId));
    setConfirmRemove(null);
  }

  const blocked = quote?.hasBlockingLines ?? false;
  const stateLabel = (l: QuoteLine) => (l.state === "out_of_stock" ? L.cart.outOfStock : l.state === "inactive" ? L.cart.inactive : l.state === "missing" ? L.cart.missing : null);

  return (
    <main className="container">
      <Stepper current={0} />
      <div className="page-head"><h1>{L.cart.title}</h1></div>
      {ready && !items.length ? (
        <div className="empty">
          <p>{L.cart.empty}</p>
          <Link href="/" className="btn">{L.cart.continue}</Link>
        </div>
      ) : (
        <div className="cart">
          <div className="stack">
            {soldOutParam.length > 0 && quote && quote.lines.filter((l) => soldOutParam.includes(l.variantId) && l.state !== "ok").map((l) => (
              <p key={l.variantId} className="notice notice-error" role="alert"><AlertIcon />{fmt(L.cart.soldOutNow, { name: `${l.name[lang]} (${l.color[lang]}, ${l.size})` })}</p>
            ))}
            {error && <p className="notice notice-error" role="alert"><AlertIcon />{L.checkout.genericError}</p>}
            <ul className="cart-table" aria-busy={!quote}>
              {!quote && items.map((i) => (<li key={i.variantId} className="cart-row"><div className="thumb skeleton" /><div className="skeleton" style={{ height: 40 }} /></li>))}
              {quote?.lines.map((l) => {
                const bad = stateLabel(l);
                return (
                  <li key={l.variantId} className="cart-row" data-state={l.state}>
                    <Thumb swatch={l.swatch} image={l.image} label={l.name[lang]} />
                    <div className="meta">
                      <span className="line-name">{l.name[lang]}</span>
                      <span className="line-meta">{l.color[lang]}, {sizeLabel(l.size, L.shop.size)}</span>
                      <span className="price">{money(l.price)}{l.compareAt && <s>{money(l.compareAt)}</s>}</span>
                      {bad && <span><span className="tag tag-error">{bad}</span></span>}
                      {priceChanged.includes(l.variantId) && <span><span className="tag tag-accent">{L.cart.priceUpdated}</span></span>}
                      {notes[l.variantId] && <span className="help" role="status">{notes[l.variantId]}</span>}
                    </div>
                    <div className="row-end">
                      {!bad ? (
                        <div className="qty-stepper" role="group" aria-label={L.cart.qty}>
                          <button type="button" aria-label={L.cart.decrease} onClick={() => (l.qty <= 1 ? setConfirmRemove(l.variantId) : setQty(l, l.qty - 1))}>−</button>
                          <input aria-label={L.cart.qty} inputMode="numeric" value={items.find((i) => i.variantId === l.variantId)?.qty ?? l.qty}
                            onChange={(e) => setQty(l, parseInt(e.target.value.replace(/\D/g, ""), 10))} />
                          <button type="button" aria-label={L.cart.increase} disabled={l.qty >= Math.min(MAX, l.available)} onClick={() => setQty(l, l.qty + 1)}>+</button>
                        </div>
                      ) : <span />}
                      <div className="stack" style={{ justifyItems: "end", gap: 4 }}>
                        <span className="line-price">{money(l.lineTotal)}</span>
                        {confirmRemove === l.variantId ? (
                          <span className="line-meta">{L.cart.confirmRemove}{" "}
                            <button type="button" className="link-btn" onClick={() => remove(l.variantId)}>{L.cart.yesRemove}</button>{" / "}
                            <button type="button" className="link-btn" onClick={() => setConfirmRemove(null)}>{L.cart.keep}</button>
                          </span>
                        ) : (
                          <button type="button" className="link-btn" onClick={() => remove(l.variantId)}>{L.cart.remove}</button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <aside className="stock summary-card">
            <h2 className="summary-title">{L.checkout.summary}</h2>
            <CouponBox
              items={items}
              ctx={{}}
              applied={coupon}
              quote={quote}
              externalMsg={couponMsg}
              onApplied={(code, q) => { setCoupon(code); saveCoupon(code); setQuote(q); setCouponMsg(null); }}
              onRemoved={() => { setCoupon(undefined); saveCoupon(undefined); setCouponMsg(null); }}
            />
            <dl className="totals">
              <dt>{L.cart.subtotal}</dt><dd>{quote ? money(quote.subtotal) : "—"}</dd>
              <dt>{L.totals.discount}</dt><dd className={quote?.discount ? "save" : undefined}>{quote?.discount ? `−${money(quote.discount)}` : money(0)}</dd>
              <dt>{L.totals.shipping}</dt><dd>{quote?.coupon?.status === "applied" && quote.coupon.type === "freeship" ? L.totals.free : L.cart.shipLater}</dd>
              <div className="rule" aria-hidden="true" />
              <dt className="grand">{L.cart.estimated}</dt><dd className="grand">{quote ? money(Math.max(0, quote.subtotal - quote.discount)) : "—"}</dd>
            </dl>
            <p className="help" style={{ margin: "12px 0 20px" }}>{L.cart.shipNote}</p>
            {blocked && <p className="notice notice-error" style={{ marginBottom: 16 }}><AlertIcon />{L.cart.blocked}</p>}
            <button type="button" className="btn btn-primary btn-block" disabled={!quote || blocked || quote.subtotal === 0} onClick={() => router.push("/checkout")}>
              {L.cart.checkout}
            </button>
            <p style={{ marginTop: 16 }}><Link href="/">{L.cart.continue}</Link></p>
          </aside>
        </div>
      )}
    </main>
  );
}

export default function CartPage() {
  return (
    <>
      <TopBar />
      <Suspense><CartInner /></Suspense>
      <Footer />
    </>
  );
}
