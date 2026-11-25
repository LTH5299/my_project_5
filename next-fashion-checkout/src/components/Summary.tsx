"use client";
import { useState, type ReactNode } from "react";
import { Thumb } from "./Chrome";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import type { Money, OrderLine } from "@/lib/types";

type Line = Pick<OrderLine, "variantId" | "name" | "color" | "size" | "swatch" | "image" | "qty" | "price"> & { compareAt?: number };

// Các dòng tiền theo SRS v1.2 BR-06: Tổng đã gồm VAT, tách Tiền hàng chưa thuế và Thuế GTGT
export function Totals({ m, couponCode, shippingKnown = true, shippingLabel, codLabel }: { m: Money; couponCode?: string; shippingKnown?: boolean; shippingLabel?: string; codLabel?: string }) {
  const { L, money } = useLang();
  const rate = Math.round(m.vatRate * 100);
  return (
    <dl className="totals">
      <dt>{L.totals.subtotal}</dt>
      <dd>{money(m.subtotal)}</dd>
      <dt>{L.totals.discount}{couponCode ? ` · ${couponCode}` : ""}</dt>
      <dd className={m.discount ? "save" : undefined}>{m.discount ? `−${money(m.discount)}` : money(0)}</dd>
      <dt>{L.totals.shipping}</dt>
      <dd>
        {!shippingKnown ? (shippingLabel ?? L.totals.pending)
          : m.shippingPayable === 0 ? (<>{m.shippingFee > 0 && <s>{money(m.shippingFee)}</s>}<span className="save">{L.totals.free}</span></>)
          : m.shippingDiscount > 0 ? (<><s>{money(m.shippingFee)}</s>{money(m.shippingPayable)}</>)
          : money(m.shippingPayable)}
      </dd>
      <div className="rule" aria-hidden="true" />
      <dt className="grand">{codLabel ?? L.totals.total} <span className="vat-inline">{L.totals.vatIncluded}</span></dt>
      <dd className="grand" aria-live="polite">{money(m.total)}</dd>
      <dt className="sub">{L.totals.net}</dt><dd className="sub">{money(m.netAmount)}</dd>
      <dt className="sub">{fmt(L.totals.vat, { rate })}</dt><dd className="sub">{money(m.vatAmount)}</dd>
    </dl>
  );
}

export function SummaryLines({ lines }: { lines: Line[] }) {
  const { lang, money } = useLang();
  return (
    <ul className="lines">
      {lines.filter((l) => l.qty > 0).map((l) => (
        <li key={l.variantId} className="line">
          <Thumb swatch={l.swatch} image={l.image} qty={l.qty} label={l.name[lang]} />
          <div>
            <div className="line-name">{l.name[lang]}</div>
            <div className="line-meta">{l.color[lang]}, {sizeLabel(l.size, "size")}</div>
          </div>
          <div className="line-price">{money(l.price * l.qty)}{l.compareAt && <s>{money(l.compareAt * l.qty)}</s>}</div>
        </li>
      ))}
    </ul>
  );
}

export function OrderSummary({ lines, money: m, couponCode, shippingKnown, shippingLabel, children }: { lines: Line[] | null; money: Money | null; couponCode?: string; shippingKnown?: boolean; shippingLabel?: string; children?: ReactNode }) {
  const { L } = useLang();
  const [open, setOpen] = useState(false);
  const count = lines?.reduce((s, l) => s + l.qty, 0) ?? 0;
  return (
    <aside className="summary" data-open={open} aria-label={L.checkout.summary}>
      <div className="stock summary-card">
        <button type="button" className="summary-toggle" aria-expanded={open} aria-controls="summary-lines" onClick={() => setOpen(!open)}>
          <span>{open ? L.checkout.hideSummary : L.checkout.showSummary}<span className="toggle-count"> ({fmt(L.checkout.itemsCount, { n: count })})</span></span>
          <span className="chev" aria-hidden="true" />
        </button>
        <div id="summary-lines" className="summary-lines">
          <h2>{L.checkout.summary}</h2>
          {!lines ? (
            <div className="stack" aria-busy="true"><div className="skeleton" style={{ height: 70 }} /><div className="skeleton" style={{ height: 70 }} /></div>
          ) : <SummaryLines lines={lines} />}
        </div>
        {children}
        {m ? <Totals m={m} couponCode={couponCode} shippingKnown={shippingKnown} shippingLabel={shippingLabel} /> : <div className="skeleton" style={{ height: 120, marginTop: 24 }} />}
        {m && <p className="vat-note">{fmt(L.totals.footer, { rate: Math.round(m.vatRate * 100) })}</p>}
      </div>
    </aside>
  );
}
