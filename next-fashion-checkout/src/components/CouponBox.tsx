"use client";
import { useEffect, useState } from "react";
import { fmt, useLang } from "@/lib/i18n/client";
import { clientId } from "@/lib/cart";
import type { CouponError, Quote } from "@/lib/pricing";
import type { CartItem } from "@/lib/types";
import { TagIcon } from "./Icons";

export type CouponMsg = { kind: "error" | "info"; text: string } | null;

// Ô nhập mã giảm giá dùng chung cho giỏ hàng và trang thanh toán (REQ-A7.3.1 đến A7.3.3)
export function CouponBox({
  items, ctx, applied, quote, onApplied, onRemoved, externalMsg,
}: {
  items: CartItem[];
  ctx: { provinceId?: string; wardId?: string; phone?: string; email?: string };
  applied?: string;
  quote: Quote | null;
  onApplied: (code: string, q: Quote) => void;
  onRemoved: () => void;
  externalMsg?: CouponMsg;
}) {
  const { L, lang, money } = useLang();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<CouponMsg>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  useEffect(() => { if (externalMsg) setMsg(externalMsg); }, [externalMsg]);
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setTimeout(() => { setLockedUntil(null); setMsg(null); }, Math.max(0, Date.parse(lockedUntil) - Date.now()));
    return () => clearTimeout(t);
  }, [lockedUntil]);

  const errText = (e: CouponError, shortfall?: number) => fmt(L.coupon.errors[e], { amount: money(shortfall ?? 0) });
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  async function apply() {
    const code = input.trim().toUpperCase();
    if (!code || busy) return; // chặn bấm Áp dụng liên tiếp
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/coupons/apply", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: clientId(), code, items, ...ctx, appliedCode: applied }),
      }).then((x) => x.json());
      if (r.status === "locked") { setLockedUntil(r.lockedUntil); setMsg({ kind: "error", text: fmt(L.coupon.locked, { time: timeOf(r.lockedUntil) }) }); }
      else if (r.status === "already_applied") setMsg({ kind: "info", text: L.coupon.oneOnly });
      else if (r.status === "applied") { onApplied(code, r.quote); setInput(""); setLockedUntil(null); }
      else if (r.status === "invalid") {
        const c = r.quote.coupon;
        let text = errText(c.error, c.shortfall);
        if (r.lockedUntil) { setLockedUntil(r.lockedUntil); text = fmt(L.coupon.locked, { time: timeOf(r.lockedUntil) }); }
        else if (r.attemptsLeft <= 2) text += " " + fmt(L.coupon.attemptsLeft, { n: r.attemptsLeft });
        setMsg({ kind: "error", text });
      }
    } catch { setMsg({ kind: "error", text: L.checkout.genericError }); }
    finally { setBusy(false); }
  }

  const ok = applied && quote?.coupon?.status === "applied" ? quote.coupon : null;

  return (
    <div className="coupon">
      <div className="coupon-head">
        <TagIcon />
        <label htmlFor="coupon">{L.coupon.label}</label>
      </div>
      {ok ? (
        <>
          <div className="coupon-applied" role="status">
            <span>
              <strong>{ok.code}</strong>
              <span className="coupon-saved">{ok.type === "freeship" ? L.coupon.freeship : fmt(L.coupon.saved, { amount: money(ok.discount) })}</span>
            </span>
            <button type="button" className="link-btn" onClick={() => { onRemoved(); setMsg(null); }}>{L.coupon.remove}</button>
          </div>
          <p className="help coupon-msg">{ok.recheckOnPhone ? L.coupon.recheck : L.coupon.oneOnly}</p>
        </>
      ) : (
        <form className="coupon-row" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <input id="coupon" className="input" placeholder={L.coupon.placeholder} value={input} autoComplete="off" spellCheck={false}
            disabled={Boolean(lockedUntil)} aria-describedby="coupon-msg" aria-invalid={msg?.kind === "error"}
            onChange={(e) => { setInput(e.target.value.toUpperCase().replace(/\s/g, "")); if (msg?.kind === "error" && !lockedUntil) setMsg(null); }} />
          <button type="submit" className="btn btn-dark" disabled={!input.trim() || busy || Boolean(lockedUntil)}>
            {busy ? <><span className="spinner" aria-hidden="true" />{L.coupon.checking}</> : L.coupon.apply}
          </button>
        </form>
      )}
      <p id="coupon-msg" className={`coupon-msg ${msg?.kind === "error" ? "error-text" : "help"}`} role={msg ? "status" : undefined}>{msg?.text}</p>
    </div>
  );
}
