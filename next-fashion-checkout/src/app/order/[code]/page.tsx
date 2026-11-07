"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Footer, Thumb, TopBar } from "@/components/Chrome";
import { AlertIcon, CheckIcon, ClockIcon, CrossIcon } from "@/components/Icons";
import { fmt, sizeLabel, useLang } from "@/lib/i18n/client";
import { writeCart } from "@/lib/cart";
import { formatDateTime, formatTime } from "@/lib/money";
import type { Order } from "@/lib/types";

type PublicOrder = Omit<Order, "token" | "idempotencyKey">;
const HOTLINE = process.env.NEXT_PUBLIC_HOTLINE ?? "1900 0000";
const ZALO = process.env.NEXT_PUBLIC_ZALO_URL ?? "https://zalo.me/";

declare global { interface Window { dataLayer?: unknown[]; fbq?: (...a: unknown[]) => void } }

function OrderInner() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const token = useSearchParams().get("t");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [skew, setSkew] = useState(0); // lệch giờ giữa máy khách và máy chủ
  const tracked = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${code}?t=${token ?? ""}`, { cache: "no-store" });
        if (r.status === 404) { if (alive) setState("notfound"); return; }
        const d = await r.json();
        if (!alive) return;
        setOrder(d.order);
        setSkew(Date.parse(d.serverNow) - Date.now());
        setState("ok");
        // Đơn SePay đang chờ: hỏi lại mỗi 3 giây để tự chuyển trạng thái khi có webhook
        if (d.order.status === "awaiting_payment") timer = setTimeout(load, 3000);
      } catch {
        if (alive) { setState((s) => (s === "ok" ? s : "error")); timer = setTimeout(load, 5000); }
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [code, token]);

  // Sự kiện Purchase chỉ ghi nhận 1 lần, kể cả khi tải lại trang
  useEffect(() => {
    if (!order || tracked.current || !token) return;
    tracked.current = true;
    fetch(`/api/orders/${order.code}/track`, { method: "POST", body: JSON.stringify({ token }) })
      .then((r) => r.json())
      .then(({ first }) => {
        if (!first) return;
        (window.dataLayer = window.dataLayer || []).push({ event: "purchase", ecommerce: { transaction_id: order.code, value: order.total, currency: "VND", shipping: order.shippingFee - order.shippingDiscount, coupon: order.couponCode } });
        window.fbq?.("track", "Purchase", { value: order.total, currency: "VND" });
      })
      .catch(() => {});
  }, [order, token]);

  function reorder() {
    if (!order) return;
    writeCart(order.items.map((i) => ({ variantId: i.variantId, qty: i.qty })));
    router.push("/checkout");
  }

  if (state === "loading") return <main className="container order-page" aria-busy="true"><div className="stack"><div className="skeleton" style={{ height: 48, width: "60%" }} /><div className="skeleton" style={{ height: 320 }} /></div></main>;
  if (state === "notfound" || state === "error") {
    return (
      <main className="container"><div className="empty">
        <h1>{state === "notfound" ? L.order.notFound : L.checkout.genericError}</h1>
        {state === "notfound" && <p>{L.order.notFoundLead}</p>}
        <Link className="btn" href="/">{L.order.continue}</Link>
      </div></main>
    );
  }
  const o = order!;
  const awaiting = o.status === "awaiting_payment";
  const paid = o.method === "sepay" && o.paymentStatus === "paid";
  const expired = o.status === "canceled_timeout";
  const shipPay = o.shippingFee - o.shippingDiscount;

  return (
    <main className="container order-page">
      <div>
        <div className="order-hero" aria-live="polite">
          {expired ? (
            <><span className="state-mark bad"><CrossIcon /></span><h1>{L.order.expiredTitle}</h1><p className="lead">{L.order.expiredLead}</p></>
          ) : paid ? (
            <><span className="state-mark ok"><CheckIcon /></span><h1>{L.order.paidTitle}</h1><p className="lead">{fmt(L.order.paidLead, { amount: money(o.total) })}</p></>
          ) : awaiting ? (
            <><span className="state-mark wait"><ClockIcon /></span><h1>{L.order.payTitle}</h1><p className="lead">{L.order.payLead}</p></>
          ) : (
            <><span className="state-mark ok"><CheckIcon /></span><h1>{L.order.thanks}</h1><p className="lead">{fmt(L.order.thanksLead, { email: o.customer.email })}</p></>
          )}
        </div>

        {awaiting && o.sepay && <div className="pay-wrap"><PayCard o={o} skew={skew} /></div>}
        {awaiting && !o.sepay && <p className="waiting"><span className="pulse" />{L.order.creatingQr}</p>}

        {expired && (
          <div className="stack" style={{ marginBottom: 32, justifyItems: "start" }}>
            <button type="button" className="btn btn-primary" onClick={reorder}>{L.order.reorder}</button>
          </div>
        )}

        <dl className="facts" style={{ marginTop: awaiting ? 40 : 0 }}>
          <dt>{L.order.code}</dt><dd><span className="num" style={{ letterSpacing: "0.04em" }}>{o.code}</span> <CopyButton text={o.code} /></dd>
          <dt>{L.order.orderStatus}</dt><dd>{L.order.statuses[o.status]}</dd>
          <dt>{L.order.paymentStatus}</dt><dd>{L.order.payStatuses[o.paymentStatus]}</dd>
          <dt>{L.order.method}</dt><dd>{L.order.methods[o.method]}</dd>
          {!expired && <><dt>{L.order.eta}</dt><dd>{fmt(paid ? L.order.processingPaid : L.order.processing, { eta: o.eta[lang] })}</dd></>}
          <dt>{L.order.shipTo}</dt><dd>{o.customer.name}, {o.customer.phone}<br />{o.address.line}, {o.address.wardName}, {o.address.provinceName}</dd>
          {o.note && <><dt>{L.order.note}</dt><dd>{o.note}</dd></>}
          <dt>{L.order.placedAt}</dt><dd>{formatDateTime(o.createdAt, lang)}</dd>
        </dl>

        <div className="support">
          <span>{L.order.support}</span>
          <a href={`tel:${HOTLINE.replace(/\s/g, "")}`}>{fmt(L.order.hotline, { phone: HOTLINE })}</a>
          <a href={ZALO} target="_blank" rel="noopener">{L.order.zalo}</a>
          <Link href="/">{L.order.continue}</Link>
        </div>
      </div>

      <aside className="summary" data-open="true">
        <div className="stock summary-card">
          <h2>{L.order.items}</h2>
          <ul className="lines">
            {o.items.map((i) => (
              <li key={i.variantId} className="line">
                <Thumb swatch={i.swatch} image={i.image} qty={i.qty} label={i.name[lang]} />
                <div><div className="line-name">{i.name[lang]}</div><div className="line-meta">{i.color[lang]}, {sizeLabel(i.size, "size")}</div></div>
                <div className="line-price">{money(i.price * i.qty)}</div>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <dt>{L.totals.subtotal}</dt><dd>{money(o.subtotal)}</dd>
            <dt>{L.totals.discount}{o.couponCode ? ` (${o.couponCode})` : ""}</dt><dd className={o.discount ? "save" : undefined}>{o.discount ? `−${money(o.discount)}` : money(0)}</dd>
            <dt>{L.totals.shipping}</dt><dd>{shipPay === 0 ? <span className="save">{L.totals.free}</span> : money(shipPay)}</dd>
            <div className="rule" aria-hidden="true" /><dt className="grand">{o.method === "cod" ? L.checkout.codAmount : L.totals.total}</dt><dd className="grand">{money(o.total)}</dd>
          </dl>
        </div>
      </aside>
    </main>
  );
}

function PayCard({ o, skew }: { o: PublicOrder; skew: number }) {
  const { L, lang, money } = useLang();
  const s = o.sepay!;
  const [src, setSrc] = useState<string | null>(s.qrImageUrl ?? null);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    if (s.qrPayload) QRCode.toDataURL(s.qrPayload, { margin: 0, width: 520, errorCorrectionLevel: "M", color: { dark: "#16202e", light: "#ffffff" } }).then(setSrc).catch(() => setSrc(null));
  }, [s.qrPayload]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(t); }, [skew]);
  const total = Date.parse(s.expiresAt) - Date.parse(s.createdAt);
  const left = Math.max(0, Date.parse(s.expiresAt) - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const urgent = left < 2 * 60 * 1000;
  return (
    <section className="stock paycard" aria-label={L.order.payTitle}>
      <div className="qr-frame">
        <div className="qr">{src ? <img src={src} alt={`VietQR ${o.code}, ${money(s.amount)}`} width={232} height={232} /> : <div className="skeleton" style={{ width: "100%", height: "100%" }} />}</div>
        <span className="qr-brand">VietQR</span>
        {src && <a className="link-btn" href={src} download={`${o.code}.png`}>{L.order.downloadQr}</a>}
      </div>
      <div className="pay-detail">
        <div>
          <div className="amount-label">{L.order.amount}</div>
          <div className="amount">{money(s.amount)}</div>
        </div>
        <div className="countdown" data-urgent={urgent} role="timer" aria-live="off">
          <div className="countdown-row">
            <span>{L.order.expiresIn}</span>
            <span className="countdown-time" aria-label={`${mm}:${ss}`}>{mm}:{ss}</span>
          </div>
          <div className="drain"><span style={{ transform: `scaleX(${total ? left / total : 0})` }} /></div>
          <span className="help">{fmt(L.order.expiresAt, { time: formatTime(s.expiresAt, lang) })}</span>
        </div>
        <dl className="kv">
          <dt>{L.order.content}</dt><dd className="code">{s.content}</dd><dd><CopyButton text={s.content} /></dd>
          <dt>{L.order.amount}</dt><dd>{s.amount}</dd><dd><CopyButton text={String(s.amount)} /></dd>
          <dt>{L.order.account}</dt><dd>{s.accountNumber}</dd><dd><CopyButton text={s.accountNumber} /></dd>
          <dt>{L.order.bank}</dt><dd style={{ gridColumn: "span 2" }}>{s.bankName}</dd>
          <dt>{L.order.accountName}</dt><dd style={{ gridColumn: "span 2" }}>{s.accountName}</dd>
        </dl>
        <p className="notice notice-warn"><AlertIcon />{L.order.noEdit}</p>
        <p className="waiting"><span className="pulse" />{L.order.waiting}</p>
      </div>
      <ol className="howto" style={{ gridColumn: "1 / -1", position: "relative", zIndex: 1 }}>
        {L.order.howTo.map((h) => <li key={h}>{h}</li>)}
      </ol>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const { L } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="copy-btn" data-copied={done} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* trình duyệt chặn */ }
    }}>{done ? L.order.copied : L.order.copy}</button>
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
