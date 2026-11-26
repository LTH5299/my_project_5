"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import QRCode from "qrcode";
import { CopyButton, Footer, TopBar } from "@/components/Chrome";
import { SummaryLines, Totals } from "@/components/Summary";
import { AlertIcon, ClockIcon, CrossIcon } from "@/components/Icons";
import { fmt, useLang } from "@/lib/i18n/client";
import { rememberOrder } from "@/lib/cart";
import { formatTime } from "@/lib/money";
import type { PaymentSession } from "@/lib/types";

type Transfer = { bankName: string; accountNumber: string; accountName: string; amount: number; content: string; qrPayload?: string; qrImageUrl?: string };
type Data = { session: Omit<PaymentSession, "idempotencyKey">; transfer: Transfer; now: string };

// SCR-07: trang thanh toán của phiên NFP. Hỏi trạng thái mỗi 3 giây; tiền về → sang trang đơn (SCR-08).
function PayInner() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [d, setD] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [skew, setSkew] = useState(0);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/pay/${code}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (r.status === 404) { if (alive) setState("notfound"); return; }
        const x: Data = await r.json();
        if (!alive) return;
        setD(x); setSkew(Date.parse(x.now) - Date.now()); setState("ok");
        if (x.session.status === "paid" && x.session.orderCode && x.session.orderToken) {
          try { localStorage.removeItem("nf_cart"); localStorage.removeItem("nf_checkout_draft"); window.dispatchEvent(new Event("nf-cart")); } catch { /* bỏ qua */ }
          rememberOrder(x.session.orderCode, x.session.orderToken);
          router.replace(`/order/${x.session.orderCode}?t=${x.session.orderToken}`);
          return;
        }
        if (x.session.status === "pending") timer = setTimeout(load, 3000);
      } catch { timer = setTimeout(load, 5000); }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [code, token, router]);

  async function switchCod() {
    setSwitching(true);
    await fetch(`/api/pay/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close", token }) }).catch(() => {});
    router.push("/checkout?from=cod");
  }

  if (state === "loading") return <main className="container order-page" aria-busy="true"><div className="stack"><div className="skeleton" style={{ height: 48, width: "60%" }} /><div className="skeleton" style={{ height: 320 }} /></div></main>;
  if (state === "notfound" || !d) return <main className="container"><div className="empty"><h1>{L.pay.notFound}</h1><Link className="btn" href="/">{L.order.continue}</Link></div></main>;

  const x = d.session;
  const st = x.status;
  return (
    <main className="container order-page">
      <div>
        <div className="order-hero" aria-live="polite">
          {st === "expired" ? (
            <><span className="state-mark bad"><CrossIcon /></span><h1>{L.pay.expiredTitle}</h1><p className="lead">{L.pay.expiredLead}</p></>
          ) : st === "closed" ? (
            <><span className="state-mark bad"><CrossIcon /></span><h1>{L.pay.closedTitle}</h1><p className="lead">{L.pay.closedLead}</p></>
          ) : (
            <><span className="state-mark wait"><ClockIcon /></span><h1>{L.pay.title}</h1><p className="lead">{L.pay.lead}</p></>
          )}
        </div>

        {st === "pending" && <div className="pay-wrap"><PayCard s={x} t={d.transfer} skew={skew} /></div>}
        {st === "pending" && (
          <div className="pay-switch">
            <p className="help">{L.pay.notOrderYet} {L.pay.switchHint}</p>
            <button type="button" className="btn btn-quiet" onClick={switchCod} disabled={switching || x.money.total > 5_000_000}>{L.pay.switchCod}</button>
          </div>
        )}
        {(st === "expired" || st === "closed") && (
          <div className="stack" style={{ marginBottom: 32, justifyItems: "start" }}>
            <Link className="btn btn-primary" href="/checkout?from=repay">{L.pay.repay}</Link>
          </div>
        )}

        <dl className="facts" style={{ marginTop: 40 }}>
          <dt>{L.pay.session}</dt><dd><span className="num">{x.code}</span></dd>
          <dt>{L.order.shipTo}</dt><dd>{x.customer.name}, {x.customer.phone}<br />{x.address.line}, {x.address.wardName}, {x.address.provinceName}</dd>
          <dt>{L.checkout.shipBy}</dt><dd>{x.pkg.serviceName[lang]}</dd>
        </dl>
      </div>
      <aside className="summary" data-open="true">
        <div className="stock summary-card">
          <h2>{L.order.items}</h2>
          <SummaryLines lines={x.items} />
          <Totals m={x.money} couponCode={x.couponCode} />
          <p className="vat-note">{fmt(L.totals.footer, { rate: Math.round(x.money.vatRate * 100) })}</p>
        </div>
      </aside>
    </main>
  );
}

function PayCard({ s, t, skew }: { s: Data["session"]; t: Transfer; skew: number }) {
  const { L, lang, money } = useLang();
  const [src, setSrc] = useState<string | null>(t.qrImageUrl ?? null);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    if (t.qrPayload) QRCode.toDataURL(t.qrPayload, { margin: 0, width: 520, errorCorrectionLevel: "M", color: { dark: "#16202e", light: "#ffffff" } }).then(setSrc).catch(() => setSrc(null));
  }, [t.qrPayload]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(i); }, [skew]);
  const total = Date.parse(s.expiresAt) - Date.parse(s.createdAt);
  const left = Math.max(0, Date.parse(s.expiresAt) - now);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  return (
    <section className="stock paycard" aria-label={L.pay.title}>
      <div className="qr-frame">
        <div className="qr">{src ? <img src={src} alt={`VietQR ${s.code}, ${money(t.amount)}`} width={232} height={232} /> : <div className="skeleton" style={{ width: "100%", height: "100%" }} />}</div>
        <span className="qr-brand">VietQR</span>
        {src && <a className="link-btn" href={src} download={`${s.code}.png`}>{L.pay.downloadQr}</a>}
      </div>
      <div className="pay-detail">
        <div>
          <div className="amount-label">{L.pay.amount}</div>
          <div className="amount">{money(t.amount)}</div>
        </div>
        <div className="countdown" data-urgent={left < 120_000} role="timer" aria-live="off">
          <div className="countdown-row">
            <span>{L.pay.expiresIn}</span>
            <span className="countdown-time" aria-label={`${mm}:${ss}`}>{mm}:{ss}</span>
          </div>
          <div className="drain"><span style={{ transform: `scaleX(${total ? left / total : 0})` }} /></div>
          <span className="help">{fmt(L.pay.expiresAt, { time: formatTime(s.expiresAt, lang) })}</span>
        </div>
        <dl className="kv">
          <dt>{L.pay.content}</dt><dd className="code">{t.content}</dd><dd><CopyButton text={t.content} /></dd>
          <dt>{L.pay.amount}</dt><dd>{t.amount}</dd><dd><CopyButton text={String(t.amount)} /></dd>
          <dt>{L.pay.account}</dt><dd>{t.accountNumber}</dd><dd><CopyButton text={t.accountNumber} /></dd>
          <dt>{L.pay.bank}</dt><dd style={{ gridColumn: "span 2" }}>{t.bankName}</dd>
          <dt>{L.pay.accountName}</dt><dd style={{ gridColumn: "span 2" }}>{t.accountName}</dd>
        </dl>
        <p className="notice notice-warn"><AlertIcon />{L.pay.noEdit}</p>
        <p className="waiting"><span className="pulse" />{L.pay.waiting}</p>
      </div>
      <ol className="howto" style={{ gridColumn: "1 / -1", position: "relative", zIndex: 1 }}>
        {L.pay.howTo.map((h) => <li key={h}>{h}</li>)}
      </ol>
    </section>
  );
}

export default function PayPage() {
  return (
    <>
      <TopBar mode="checkout" />
      <Suspense><PayInner /></Suspense>
      <Footer slim />
    </>
  );
}
