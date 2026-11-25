"use client";
import { useEffect, useRef, useState } from "react";
import { fmt, useLang } from "@/lib/i18n/client";
import { formatTime } from "@/lib/money";
import { clientId } from "@/lib/cart";
import type { CartItem, Localized } from "@/lib/types";
import type { CouponError } from "@/lib/pricing";

type Row = { code: string; title: Localized; endsAt: string; ok: boolean; error?: CouponError; shortfall?: number; saving: number };
export type CouponCtx = { items: CartItem[]; provinceId: string; wardId: string; pkgId?: string; phone: string; email: string };

// Hộp thoại chọn mã SCR-04: danh sách mã công khai (mã chưa đủ điều kiện hiện mờ kèm lý do),
// ô nhập mã + Áp dụng, "Không dùng mã", "Xác nhận". Chọn mã mới thì thay mã cũ.
export function CouponDialog({ ctx, current, onClose, onConfirm }: { ctx: CouponCtx; current?: string; onClose: () => void; onConfirm: (code?: string) => void }) {
  const { L, lang, money } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(current);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list", ...ctx }) })
      .then((r) => r.json()).then((d) => setRows(d.coupons)).catch(() => setRows([]));
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errText = (e: CouponError, shortfall?: number) => fmt(L.coupon.errors[e], { amount: money(shortfall ?? 0) });

  async function apply() {
    const code = typed.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ctx, couponCode: code, typed: true, clientId: clientId() }) }).then((x) => x.json());
      if (r.status === "locked") setMsg({ kind: "error", text: fmt(L.coupon.locked, { time: formatTime(r.lockedUntil, lang) }) });
      else if (r.status === "applied") {
        const c = r.quote.coupon;
        setSelected(code);
        setRows((rs) => (rs?.some((x) => x.code === code) ? rs : [{ code, title: c.title, endsAt: "", ok: true, saving: c.discount + c.shippingDiscount }, ...(rs ?? [])]));
        setMsg({ kind: "success", text: fmt(L.coupon.applied, { code }) });
        setTyped("");
      } else {
        const c = r.quote.coupon;
        const left = r.lockedUntil ? fmt(L.coupon.locked, { time: formatTime(r.lockedUntil, lang) }) : r.attemptsLeft < 5 ? fmt(L.coupon.attemptsLeft, { n: r.attemptsLeft }) : "";
        setMsg({ kind: "error", text: `${errText(c.error, c.shortfall)}. ${left}`.trim() });
      }
    } catch { setMsg({ kind: "error", text: L.checkout.genericError }); }
    setBusy(false);
  }

  return (
    <div className="dialog-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog stock coupon-dialog" role="dialog" aria-modal="true" aria-labelledby="cp-t">
        <div className="dialog-head">
          <h2 id="cp-t">{L.coupon.title}</h2>
          <button ref={closeRef} type="button" className="link-btn" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <form className="coupon-row" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <input className="input" aria-label={L.coupon.inputPh} placeholder={L.coupon.inputPh} value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" spellCheck={false} />
          <button type="submit" className="btn" disabled={busy || !typed.trim()}>{busy ? L.coupon.checking : L.coupon.apply}</button>
        </form>
        {msg && <p className={`coupon-msg ${msg.kind === "error" ? "error-text" : "save"}`} role="status">{msg.text}</p>}
        <div className="coupon-list" role="radiogroup" aria-label={L.coupon.title}>
          {!rows ? <div className="skeleton" style={{ height: 160 }} /> : rows.map((c) => (
            <label key={c.code} className="coupon-item" data-disabled={!c.ok}>
              <input type="radio" name="cp" checked={selected === c.code} disabled={!c.ok} onChange={() => setSelected(c.code)} />
              <span className="coupon-tag">{c.code}</span>
              <span className="coupon-body">
                <span className="coupon-title">{c.title[lang]}</span>
                {c.ok ? <span className="save">{fmt(L.coupon.saving, { amount: money(c.saving) })}</span>
                  : <span className="error-text">{errText(c.error!, c.shortfall)}</span>}
                {c.endsAt && <span className="line-meta">{fmt(L.coupon.expires, { date: new Date(c.endsAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB") })}</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="help">{L.coupon.recheck}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={() => onConfirm(undefined)}>{L.coupon.none}</button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(selected)}>{L.coupon.confirm}</button>
        </div>
      </div>
    </div>
  );
}
