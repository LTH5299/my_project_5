"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CopyButton, Footer, TopBar } from "@/components/Chrome";
import { SummaryLines, Totals } from "@/components/Summary";
import { AlertIcon, CheckIcon, ClockIcon, CrossIcon, TruckIcon } from "@/components/Icons";
import { fmt, useLang } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/money";
import type { Order, RefundRequest } from "@/lib/types";

type PublicOrder = Omit<Order, "idempotencyKey"> & { cancelable: boolean; refund?: RefundRequest };
const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "1900 0000";
const ZALO = process.env.NEXT_PUBLIC_ZALO_URL ?? "https://zalo.me/";
const EARLY = ["pending_confirmation", "paid", "packing", "awaiting_pickup"];

declare global { interface Window { dataLayer?: unknown[]; fbq?: (...a: unknown[]) => void } }

// SCR-08 (đặt thành công) và chi tiết đơn UC-09: hành trình, mã vận đơn, hủy đơn UC-10
function OrderInner() {
  const { L, lang, money } = useLang();
  const { code } = useParams<{ code: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const tracked = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/orders/${code}?t=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    if (!r || r.status === 404) { setState("notfound"); return; }
    const d = await r.json();
    setOrder(d.order); setTrackUrl(d.trackingUrl); setState("ok");
  }, [code, token]);
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);

  // Sự kiện Purchase chỉ ghi nhận 1 lần, kể cả khi tải lại trang
  useEffect(() => {
    if (!order || tracked.current || !token) return;
    tracked.current = true;
    fetch(`/api/orders/${order.code}/track`, { method: "POST", body: JSON.stringify({ token }) })
      .then((r) => r.json())
      .then(({ first }) => {
        if (!first) return;
        (window.dataLayer = window.dataLayer || []).push({ event: "purchase", ecommerce: { transaction_id: order.code, value: order.money.total, currency: "VND", shipping: order.money.shippingPayable, tax: order.money.vatAmount, coupon: order.couponCode } });
        window.fbq?.("track", "Purchase", { value: order.money.total, currency: "VND" });
      }).catch(() => {});
  }, [order, token]);

  async function cancel(reason: string) {
    const r = await fetch(`/api/orders/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", token, reason }) }).then((x) => x.json()).catch(() => null);
    setCancelOpen(false);
    if (r?.ok) { setOrder(r.order); setFlash({ kind: "ok", text: L.order.canceledOk + (r.order.paymentStatus === "refund_pending" ? " " + L.order.refundNote : "") }); }
    else setFlash({ kind: "error", text: r?.error === "picked_up" ? L.order.pickedUp : r?.error === "not_cancelable" ? L.order.notCancelable : L.checkout.genericError });
    load();
  }

  if (state === "loading") return <main className="container order-page" aria-busy="true"><div className="stack"><div className="skeleton" style={{ height: 48, width: "60%" }} /><div className="skeleton" style={{ height: 320 }} /></div></main>;
  if (state === "notfound" || !order) {
    return <main className="container"><div className="empty"><h1>{L.order.notFound}</h1><p>{L.order.notFoundLead}</p><div className="actions"><Link className="btn" href="/orders">{L.nav.lookup}</Link><Link className="btn btn-quiet" href="/">{L.order.continue}</Link></div></div></main>;
  }
  const o = order;
  const early = EARLY.includes(o.status);
  const canceled = o.status === "canceled";
  const sh = o.shipment;
  const eta = new Date(sh.etaDate).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <main className="container order-page">
      <div>
        <div className="order-hero" aria-live="polite">
          {canceled ? (<><span className="state-mark bad"><CrossIcon /></span><h1>{L.order.statuses.canceled}</h1><p className="lead">{o.cancelReason}{o.paymentStatus === "refund_pending" ? ` · ${L.order.refundNote}` : ""}</p></>)
            : early ? (<><span className="state-mark ok"><CheckIcon /></span><h1>{o.method === "sepay" ? L.order.thanksPaid : L.order.thanksCod}</h1>
              <p className="lead">{fmt(L.order.leadEmail, { email: o.customer.email })}{o.status === "pending_confirmation" ? ` ${L.order.leadConfirm}` : ""}</p></>)
            : (<><span className="state-mark wait">{o.status === "delivered" ? <CheckIcon /> : <ClockIcon />}</span><h1>{L.order.statuses[o.status]}</h1><p className="lead">{L.order.code} {o.code}</p></>)}
        </div>

        {flash && <p className={`notice ${flash.kind === "ok" ? "notice-success" : "notice-error"}`} role="status" style={{ marginBottom: 24 }}><AlertIcon />{flash.text}</p>}

        {!canceled && (
          <div className="track-card stock">
            <TruckIcon />
            <div>
              <div className="amount-label">{L.order.tracking}</div>
              {sh.trackingCode ? (
                <div className="track-code"><span className="num">{sh.carrier} {sh.trackingCode}</span> <CopyButton text={sh.trackingCode} />{trackUrl && <a href={trackUrl} target="_blank" rel="noopener" className="track-link">{L.order.track}</a>}</div>
              ) : <p className="help">{o.status === "pending_confirmation" ? L.order.waybillPending : L.order.waybillError}</p>}
              <p className="help">{sh.serviceName[lang]} · {L.order.eta}: {eta}</p>
            </div>
          </div>
        )}

        <dl className="facts">
          <dt>{L.order.code}</dt><dd><span className="num" style={{ letterSpacing: "0.04em" }}>{o.code}</span> <CopyButton text={o.code} /></dd>
          <dt>{L.order.status}</dt><dd>{L.order.statuses[o.status]}</dd>
          <dt>{L.order.payment}</dt><dd>{L.order.payStatuses[o.paymentStatus]}</dd>
          <dt>{L.order.method}</dt><dd>{L.order.methods[o.method]}</dd>
          <dt>{L.order.shipTo}</dt><dd>{o.customer.name}, {o.customer.phone}<br />{o.address.line}, {o.address.wardName}, {o.address.provinceName}</dd>
          {o.note && <><dt>{L.order.note}</dt><dd>{o.note}</dd></>}
          <dt>{L.order.placedAt}</dt><dd>{formatDateTime(o.createdAt, lang)}</dd>
        </dl>

        <section className="timeline-wrap" aria-labelledby="tl">
          <h2 id="tl">{L.order.timeline}</h2>
          <ol className="timeline">
            {[...o.timeline].reverse().map((e, i) => (
              <li key={i} data-first={i === 0}>
                <span className="tl-label">{e.status in L.order.statuses ? L.order.statuses[e.status as keyof typeof L.order.statuses] : L.order.events[e.status as keyof typeof L.order.events]}</span>
                <span className="line-meta">{formatDateTime(e.at, lang)}{e.note && e.status !== "waybill_error" ? ` · ${e.note}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="support">
          {o.cancelable && <button type="button" className="btn btn-quiet" onClick={() => setCancelOpen(true)}>{L.order.cancel}</button>}
          <span>{L.order.support}</span>
          <a href={`tel:${HOTLINE.replace(/\s/g, "")}`}>{fmt(L.order.hotline, { phone: HOTLINE })}</a>
          <a href={ZALO} target="_blank" rel="noopener">{L.order.zalo}</a>
          <Link href="/">{L.order.continue}</Link>
        </div>
      </div>

      <aside className="summary" data-open="true">
        <div className="stock summary-card">
          <h2>{L.order.items}</h2>
          <SummaryLines lines={o.items} />
          <Totals m={o.money} couponCode={o.couponCode} />
          <p className="vat-note">{fmt(L.totals.footer, { rate: Math.round(o.money.vatRate * 100) })}</p>
        </div>
      </aside>
      {cancelOpen && <CancelDialog code={o.code} onClose={() => setCancelOpen(false)} onConfirm={cancel} />}
    </main>
  );
}

function CancelDialog({ code, onClose, onConfirm }: { code: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const { L } = useLang();
  const [choice, setChoice] = useState<string>("");
  const [other, setOther] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const reason = choice === "other" ? other.trim() : choice;
  return (
    <div className="dialog-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog stock" role="dialog" aria-modal="true" aria-labelledby="cx-t">
        <h2 id="cx-t">{fmt(L.order.cancelTitle, { code })}</h2>
        <p>{L.order.cancelLead}</p>
        <div className="choices" role="radiogroup" aria-labelledby="cx-t">
          {L.order.reasons.map((r, i) => (
            <label key={r} className="choice compact"><input ref={i === 0 ? first : undefined} type="radio" name="cx" checked={choice === r} onChange={() => setChoice(r)} /><span className="choice-title">{r}</span><span /></label>
          ))}
          <label className="choice compact"><input type="radio" name="cx" checked={choice === "other"} onChange={() => setChoice("other")} /><span className="choice-title">{L.order.reasonOther}</span><span /></label>
        </div>
        {choice === "other" && <textarea className="textarea" aria-label={L.order.reasonOther} maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} />}
        {tried && !reason && <p className="error-text" role="alert">{L.order.reasonRequired}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>{L.order.cancelKeep}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { setTried(true); if (!reason) return; setBusy(true); await onConfirm(reason); }}>{L.order.cancelConfirm}</button>
        </div>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <>
      <TopBar />
      <Suspense><OrderInner /></Suspense>
      <Footer slim />
    </>
  );
}
