"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer, Thumb, TopBar } from "@/components/Chrome";
import { AlertIcon } from "@/components/Icons";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import { useCart } from "@/lib/cart";
import type { CheckoutQuote } from "@/lib/quote";
import type { QuoteLine } from "@/lib/pricing";

const PRICE_KEY = "nf_cart_prices";
const MAX = 10; // SCR-01: tối đa min(tồn, 10) mỗi dòng

function readPrices(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}"); } catch { return {}; }
}

export default function CartPage() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const { items, ready, update } = useCart();
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [error, setError] = useState(false);
  const [priceChanged, setPriceChanged] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ready) return;
    if (!items.length) { setQuote(null); return; }
    let alive = true;
    fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) })
      .then((r) => r.json())
      .then((q: CheckoutQuote) => {
        if (!alive) return;
        setError(false);
        setQuote(q);
        // Mỗi lần mở giỏ: kiểm tra lại tồn, giá, trạng thái bán
        const prices = readPrices();
        setPriceChanged(q.lines.filter((l) => prices[l.variantId] != null && prices[l.variantId] !== l.price).map((l) => l.variantId));
        try { localStorage.setItem(PRICE_KEY, JSON.stringify(Object.fromEntries(q.lines.map((l) => [l.variantId, l.price])))); } catch { /* bỏ qua */ }
        const reduced = q.lines.filter((l) => l.state === "reduced");
        if (reduced.length) {
          setNotes((n) => ({ ...n, ...Object.fromEntries(reduced.map((l) => [l.variantId, fmt(L.cart.reduced, { n: l.qty })])) }));
          update(items.map((i) => { const r = reduced.find((x) => x.variantId === i.variantId); return r ? { ...i, qty: r.qty } : i; }));
        }
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, JSON.stringify(items)]);

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

  const blocking = quote?.lines.filter((l) => l.state === "out_of_stock" || l.state === "inactive" || l.state === "missing") ?? [];
  const stateLabel = (l: QuoteLine) => (l.state === "out_of_stock" ? L.cart.outOfStock : l.state === "inactive" ? L.cart.inactive : l.state === "missing" ? L.cart.missing : null);

  return (
    <>
      <TopBar />
      <main className="container">
        <div className="page-head"><h1>{L.cart.title}</h1></div>
        {ready && !items.length ? (
          <div className="empty">
            <p>{L.cart.empty}</p>
            <Link href="/" className="btn">{L.cart.continue}</Link>
          </div>
        ) : (
          <div className="cart">
            <div className="stack">
              {blocking.map((l) => (
                <p key={l.variantId} className="notice notice-error" role="alert"><AlertIcon />{fmt(L.cart.soldOut, { name: l.name[lang], variant: `${l.color[lang]}/${l.size}` })}</p>
              ))}
              {error && <p className="notice notice-error" role="alert"><AlertIcon />{L.checkout.genericError}</p>}
              <ul className="cart-table" aria-busy={!quote}>
                {!quote && items.map((i) => (<li key={i.variantId} className="cart-row"><div className="thumb skeleton" /><div className="skeleton" style={{ height: 40 }} /></li>))}
                {quote?.lines.map((l) => {
                  const bad = stateLabel(l);
                  const cap = Math.min(MAX, l.available);
                  return (
                    <li key={l.variantId} className="cart-row" data-state={l.state}>
                      <Thumb swatch={l.swatch} image={l.image} label={l.name[lang]} />
                      <div className="meta">
                        <span className="line-name">{l.name[lang]}</span>
                        <span className="line-meta">{l.color[lang]}, {sizeLabel(l.size, L.shop.size)}</span>
                        <span className="price">{money(l.price)}{l.compareAt && <s>{money(l.compareAt)}</s>}</span>
                        {bad && <span><span className="tag tag-error">{bad}</span></span>}
                        {priceChanged.includes(l.variantId) && <span><span className="tag tag-accent">{L.cart.priceUpdated}</span></span>}
                        {!bad && <span className="help">{fmt(L.cart.maxQty, { n: cap })}</span>}
                        {notes[l.variantId] && <span className="help" role="status">{notes[l.variantId]}</span>}
                      </div>
                      <div className="row-end">
                        {!bad ? (
                          <div className="qty-stepper" role="group" aria-label={L.cart.qty}>
                            <button type="button" aria-label={L.cart.decrease} onClick={() => (l.qty <= 1 ? setConfirmRemove(l.variantId) : setQty(l, l.qty - 1))}>−</button>
                            <input aria-label={L.cart.qty} inputMode="numeric" value={items.find((i) => i.variantId === l.variantId)?.qty ?? l.qty}
                              onChange={(e) => setQty(l, parseInt(e.target.value.replace(/\D/g, ""), 10))} />
                            <button type="button" aria-label={L.cart.increase} disabled={l.qty >= cap} onClick={() => setQty(l, l.qty + 1)}>+</button>
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
              <dl className="totals">
                <dt className="grand">{L.cart.subtotal}</dt><dd className="grand">{quote ? money(quote.money.subtotal) : "—"}</dd>
              </dl>
              <p className="help" style={{ margin: "12px 0 20px" }}>{L.cart.note}</p>
              <button type="button" className="btn btn-primary btn-block" disabled={!quote || quote.blocking || quote.money.subtotal === 0} onClick={() => router.push("/checkout")}>
                {L.cart.buy}
              </button>
              <p style={{ marginTop: 16 }}><Link href="/">{L.cart.continue}</Link></p>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
