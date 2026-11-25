"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer, TopBar } from "@/components/Chrome";
import { AlertIcon } from "@/components/Icons";
import { fmt, useLang } from "@/lib/i18n/client";
import { recentOrders } from "@/lib/cart";
import { formatDateTime } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";

type Mine = { code: string; token: string; createdAt: string; status: OrderStatus; total: number; count: number };

// UC-09: tra cứu đơn bằng mã + SĐT, hoặc "Đơn hàng của tôi" khi đăng nhập
export default function OrdersPage() {
  const { L, lang, money } = useLang();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [recent, setRecent] = useState<{ code: string; token: string }[]>([]);

  const loadMine = () => fetch("/api/orders/mine").then(async (r) => { setLoggedIn(r.ok); setMine(r.ok ? (await r.json()).orders : []); }).catch(() => setMine([]));
  useEffect(() => { loadMine(); setRecent(recentOrders()); }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNotFound(false);
    const r = await fetch("/api/orders/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim(), phone }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setNotFound(true); return; }
    const d = await r.json();
    router.push(`/order/${d.code}?t=${d.token}`);
  }

  return (
    <>
      <TopBar />
      <main className="container orders-page">
        <section className="stock lookup-card" aria-labelledby="lk">
          <h1 id="lk">{L.lookup.title}</h1>
          <p className="help">{L.lookup.lead}</p>
          <form className="stack" onSubmit={lookup}>
            <div className="grid-2">
              <div className="field"><label htmlFor="lk-code">{L.lookup.code}</label><input id="lk-code" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NFXXXXXXXX" required autoCapitalize="characters" /></div>
              <div className="field"><label htmlFor="lk-phone">{L.lookup.phone}</label><input id="lk-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
            </div>
            {notFound && <p className="notice notice-error" role="alert"><AlertIcon />{L.lookup.notFound}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{L.lookup.submit}</button>
          </form>
        </section>

        <section aria-labelledby="mine">
          <h2 id="mine">{L.lookup.mine}</h2>
          {!loggedIn ? (
            <div className="member-row">
              <span>{L.lookup.loginLead}</span>
              <button type="button" className="link-btn" onClick={async () => { await fetch("/api/auth/demo", { method: "POST", body: JSON.stringify({ action: "login" }) }); loadMine(); }}>{L.lookup.login}</button>
            </div>
          ) : !mine?.length ? <p className="help">{L.lookup.empty}</p> : (
            <ul className="order-list">
              {mine.map((o) => (
                <li key={o.code}>
                  <Link href={`/order/${o.code}?t=${o.token}`}>
                    <span className="num">{o.code}</span>
                    <span className="line-meta">{formatDateTime(o.createdAt, lang)} · {fmt(L.checkout.itemsCount, { n: o.count })}</span>
                    <span className="tag">{L.order.statuses[o.status]}</span>
                    <span className="num">{money(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <>
              <h3 style={{ marginTop: 32 }}>{L.lookup.recent}</h3>
              <ul className="inline-list recent-list">
                {recent.map((o) => <li key={o.code}><Link href={`/order/${o.code}?t=${o.token}`} className="num">{o.code}</Link></li>)}
              </ul>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
