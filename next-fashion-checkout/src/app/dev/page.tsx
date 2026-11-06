"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Footer, TopBar } from "@/components/Chrome";
import { formatDateTime, formatVnd } from "@/lib/money";

type State = {
  orders: { code: string; token: string; method: string; status: string; paymentStatus: string; total: number; createdAt: string; expiresAt?: string; customer: string; phone: string }[];
  unmatched: { transactionId: string; receivedAt: string; amount: number; content: string; orderCode?: string; reason: string; expectedAmount?: number }[];
  outbox: { id: string; to: string; subject: string; event: string; status: string; attempts: number; createdAt: string; lastError?: string }[];
  settings: { sepayFailNext: boolean; mailFailNext: boolean };
  variants: { id: string; sku: string; name: string; stock: number; price: number }[];
};

const REASON: Record<string, string> = {
  order_not_found: "Không tìm thấy mã đơn trong nội dung",
  order_canceled: "Đơn đã hủy do quá hạn",
  amount_mismatch: "Số tiền không khớp",
  already_paid: "Đơn đã thanh toán trước đó",
  not_sepay_order: "Đơn không thanh toán qua SePay",
};
const STATUS: Record<string, string> = {
  pending_confirmation: "Chờ xác nhận", awaiting_payment: "Chờ thanh toán", packing: "Đang đóng gói",
  canceled_timeout: "Đã hủy do quá hạn", canceled_qr_error: "Hủy (lỗi tạo QR)",
};

// Công cụ giả lập cho Tester và BA: thay vai SePay, Kế toán, Kho để chạy đủ các nhánh.
export default function DevPage() {
  const [s, setS] = useState<State | null>(null);
  const [log, setLog] = useState<string>("");
  const load = useCallback(() => fetch("/api/dev/state", { cache: "no-store" }).then((r) => r.json()).then(setS), []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  const act = async (body: object, label: string) => {
    const r = await fetch("/api/dev/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    setLog(`${new Date().toLocaleTimeString("vi-VN")}  ${label}: ${JSON.stringify(r.outcome ?? r)}`);
    load();
    return r;
  };

  return (
    <>
      <TopBar />
      <main className="container dev">
        <div className="page-head" style={{ paddingBottom: 0 }}>
          <h1>Công cụ giả lập thanh toán</h1>
          <p>Thay vai SePay gửi webhook, Kế toán xem giao dịch không khớp đơn, và hộp thư nhận email. Chỉ có ở bản chạy thử.</p>
          <p><Link href="/dev/images">Thay ảnh sản phẩm</Link></p>
        </div>
        {log && <p className="notice notice-info" role="status" style={{ fontFamily: "var(--font-body)" }}>{log}</p>}

        <section className="stock dev-panel">
          <h2>Đơn hàng gần đây</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Mã đơn</th><th>Khách</th><th>Phương thức</th><th>Trạng thái</th><th>Tổng</th><th>Hết hạn QR</th><th>Giả lập SePay</th></tr></thead>
              <tbody>
                {s?.orders.length === 0 && <tr><td colSpan={7}>Chưa có đơn. <Link href="/">Đặt một đơn</Link> để bắt đầu.</td></tr>}
                {s?.orders.map((o) => (
                  <tr key={o.code}>
                    <td><Link href={`/order/${o.code}?t=${o.token}`} target="_blank">{o.code}</Link></td>
                    <td>{o.customer}<br /><span className="line-meta">{o.phone}</span></td>
                    <td>{o.method === "cod" ? "COD" : "SePay"}</td>
                    <td>{STATUS[o.status] ?? o.status}</td>
                    <td>{formatVnd(o.total)}</td>
                    <td>{o.expiresAt ? formatDateTime(o.expiresAt) : "—"}</td>
                    <td>
                      {o.method === "sepay" && (
                        <div className="row-actions">
                          <button type="button" className="btn btn-sm" onClick={() => act({ action: "transfer", orderCode: o.code }, "Chuyển đúng")}>Chuyển đúng</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={async () => {
                            const r = await act({ action: "transfer", orderCode: o.code }, "Lần 1");
                            await act({ action: "transfer", orderCode: o.code, txId: r.txId }, "Gửi lại cùng giao dịch");
                          }}>Webhook trùng</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => act({ action: "transfer", orderCode: o.code, amount: o.total - 1 }, "Lệch 1đ")}>Lệch 1đ</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => act({ action: "transfer", orderCode: o.code, content: "chuyen tien mua hang" }, "Sai nội dung")}>Sai nội dung</button>
                          {o.status === "awaiting_payment" && <>
                            <button type="button" className="btn btn-sm btn-quiet" onClick={() => act({ action: "shorten", orderCode: o.code }, "Còn 20 giây")}>Còn 20 giây</button>
                            <button type="button" className="btn btn-sm btn-quiet" onClick={() => act({ action: "expire", orderCode: o.code }, "Hết hạn ngay")}>Hết hạn ngay</button>
                          </>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Giao dịch không khớp đơn (Kế toán đối chiếu)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Mã giao dịch</th><th>Thời điểm</th><th>Số tiền</th><th>Nội dung</th><th>Đơn</th><th>Lý do</th></tr></thead>
              <tbody>
                {s?.unmatched.length === 0 && <tr><td colSpan={6}>Chưa có giao dịch nào.</td></tr>}
                {s?.unmatched.map((u) => (
                  <tr key={u.transactionId}>
                    <td>{u.transactionId}</td><td>{formatDateTime(u.receivedAt)}</td>
                    <td>{formatVnd(u.amount)}{u.expectedAmount != null && u.expectedAmount !== u.amount && <><br /><span className="line-meta">Cần {formatVnd(u.expectedAmount)}</span></>}</td>
                    <td>{u.content}</td><td>{u.orderCode ?? "—"}</td><td>{REASON[u.reason] ?? u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Hộp thư giả lập</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Gửi đến</th><th>Tiêu đề</th><th>Trạng thái</th><th>Số lần gửi</th><th>Thời điểm</th></tr></thead>
              <tbody>
                {s?.outbox.length === 0 && <tr><td colSpan={5}>Chưa có email.</td></tr>}
                {s?.outbox.map((m) => (
                  <tr key={m.id}>
                    <td>{m.to}</td>
                    <td><a href={`/dev/mail/${encodeURIComponent(m.id)}`} target="_blank" rel="noopener">{m.subject}</a></td>
                    <td>{m.status === "sent" ? "Đã gửi" : m.status === "failed" ? `Lỗi, sẽ gửi lại (${m.lastError})` : "Chờ gửi"}</td>
                    <td>{m.attempts}</td><td>{formatDateTime(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Tình huống lỗi và dữ liệu</h2>
          <label className="check"><input type="checkbox" checked={Boolean(s?.settings.sepayFailNext)} onChange={() => act({ action: "toggleSepayFail" }, "Lỗi SePay")} />SePay lỗi ở lần tạo QR tiếp theo</label>
          <label className="check"><input type="checkbox" checked={Boolean(s?.settings.mailFailNext)} onChange={() => act({ action: "toggleMailFail" }, "Lỗi email")} />Gửi email lỗi ở lần tiếp theo</label>
          <div className="row-actions">
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => act({ action: "retryMail" }, "Gửi lại email lỗi")}>Gửi lại email lỗi ngay</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => { if (confirm("Xóa toàn bộ đơn và đưa dữ liệu về ban đầu?")) act({ action: "reset" }, "Đặt lại dữ liệu"); }}>Đặt lại dữ liệu mẫu</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn kho</th><th>Giá bán</th></tr></thead>
              <tbody>
                {s?.variants.map((v) => (
                  <tr key={v.id}>
                    <td>{v.sku}</td><td>{v.name}</td>
                    <td><input className="input" style={{ width: 90, minHeight: 36 }} type="number" min={0} defaultValue={v.stock} key={`s${v.stock}`} aria-label={`Tồn kho ${v.sku}`}
                      onBlur={(e) => Number(e.target.value) !== v.stock && act({ action: "setStock", variantId: v.id, stock: Number(e.target.value) }, `Tồn ${v.sku}`)} /></td>
                    <td><input className="input" style={{ width: 130, minHeight: 36 }} type="number" min={0} step={1000} defaultValue={v.price} key={`p${v.price}`} aria-label={`Giá ${v.sku}`}
                      onBlur={(e) => Number(e.target.value) !== v.price && act({ action: "setPrice", variantId: v.id, price: Number(e.target.value) }, `Giá ${v.sku}`)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Mã giảm giá mẫu</h2>
          <p className="help">GIAM10 (10%, tối đa 80.000đ, đơn từ 500.000đ), GIAM100K, FREESHIP (đơn từ 300.000đ), NAM15 (chỉ hàng Nam), KHONGSALE (không áp hàng Sale), HETHAN, SAPMO, HETLUOT, MOTLAN (SĐT 0912345678 đã dùng).</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
