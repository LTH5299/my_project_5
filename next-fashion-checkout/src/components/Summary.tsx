"use client";
import { useState, type ReactNode } from "react";
import { Thumb } from "./Chrome";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import type { Quote } from "@/lib/pricing";

// Tóm tắt đơn: Tạm tính, Giảm giá, Phí vận chuyển, Tổng thanh toán (REQ-A7.2.2)
export function Totals({ q, shippingLoading, hideShipping }: { q: Quote | null; shippingLoading?: boolean; hideShipping?: boolean }) {
  const { L, money } = useLang();
  if (!q) return null;
  const shipOk = q.shipping.status === "ok";
  return (
    <dl className="totals">
      <dt>{L.totals.subtotal}</dt>
      <dd>{money(q.subtotal)}</dd>
      <dt>{L.totals.discount}</dt>
      <dd className={q.discount ? "save" : undefined}>{q.discount ? `−${money(q.discount)}` : money(0)}</dd>
      {!hideShipping && (
        <>
          <dt>{L.totals.shipping}</dt>
          <dd>
            {shippingLoading ? L.checkout.shippingCalculating : !shipOk ? L.totals.pending
              : q.shippingPayable === 0 ? (<>{q.shipping.fee > 0 && <s>{money(q.shipping.fee)}</s>}<span className="save">{L.totals.free}</span></>)
              : money(q.shippingPayable)}
          </dd>
        </>
      )}
      <div className="rule" aria-hidden="true" />
      <dt className="grand">{L.totals.total}</dt>
      <dd className="grand" aria-live="polite">{money(q.total)}</dd>
      <dd className="vat">{L.totals.vat}</dd>
    </dl>
  );
}

export function OrderSummary({ q, coupon, shippingLoading }: { q: Quote | null; coupon?: ReactNode; shippingLoading?: boolean }) {
  const { L, lang, money } = useLang();
  const [open, setOpen] = useState(false);
  const count = q?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;
  return (
    <aside className="summary" data-open={open} aria-label={L.checkout.summary}>
      <div className="stock summary-card">
        <button type="button" className="summary-toggle" aria-expanded={open} aria-controls="summary-lines" onClick={() => setOpen(!open)}>
          <span>{open ? L.checkout.hideSummary : L.checkout.showSummary}<span className="toggle-count"> ({fmt(L.checkout.itemsCount, { n: count })})</span></span>
          <span className="chev" aria-hidden="true" />
        </button>
        <div id="summary-lines" className="summary-lines">
          <h2>{L.checkout.summary}</h2>
          {!q ? (
            <div className="stack" aria-busy="true"><div className="skeleton" style={{ height: 70 }} /><div className="skeleton" style={{ height: 70 }} /></div>
          ) : (
            <ul className="lines">
              {q.lines.filter((l) => l.qty > 0).map((l) => (
                <li key={l.variantId} className="line">
                  <Thumb swatch={l.swatch} image={l.image} qty={l.qty} label={l.name[lang]} />
                  <div>
                    <div className="line-name">{l.name[lang]}</div>
                    <div className="line-meta">{l.color[lang]}, {sizeLabel(l.size, "size")}</div>
                  </div>
                  <div className="line-price">{money(l.lineTotal)}{l.compareAt && <s>{money(l.compareAt * l.qty)}</s>}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {coupon}
        {q ? <Totals q={q} shippingLoading={shippingLoading} /> : <div className="skeleton" style={{ height: 120, marginTop: 24 }} />}
      </div>
    </aside>
  );
}
