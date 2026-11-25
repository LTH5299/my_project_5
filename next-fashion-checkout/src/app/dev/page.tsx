"use client";
import Link from "next/link";
import { Footer, TopBar } from "@/components/Chrome";
import { formatDateTime, formatVnd } from "@/lib/money";
import { RECON_VI, SESSION_VI, STATUS_VI, useAdminState } from "@/lib/useAdminState";

const CARRIER_STEPS: [string, string][] = [["picked", "Đã lấy hàng"], ["delivering", "Đang giao"], ["delivered", "Giao thành công"], ["failed", "Giao thất bại"], ["returned", "Hoàn hàng"], ["cancel", "ĐVVC hủy"]];
const MODES: [string, string][] = [["ok", "Bình thường"], ["error", "Lỗi 500"], ["timeout", "Quá 5 giây"], ["unserved", "Không phục vụ"]];

// Bảng giả lập cho Tester và BA: thay vai SePay, GHN, Viettel Post để chạy đủ các nhánh của SRS v1.2.
export default function DevPage() {
  const { s, log, sim } = useAdminState();
  const st = s?.settings;
  return (
    <>
      <TopBar />
      <main className="container dev">
        <div className="page-head" style={{ paddingBottom: 0 }}>
          <h1>Bảng giả lập</h1>
          <p>Thay vai SePay (chuyển khoản, webhook lỡ, tiền đến muộn), GHN và Viettel Post (báo phí, vận đơn, trạng thái giao). Chỉ có ở bản chạy thử.</p>
          <p className="inline-links"><Link href="/admin">Màn hình nội bộ (CSKH, Kho, Kế toán)</Link><Link href="/dev/images">Thay ảnh sản phẩm</Link></p>
        </div>
        {log && <p className="notice notice-info" role="status">{log}</p>}

        <section className="stock dev-panel">
          <h2>Đối tác và công tắc lỗi</h2>
          <div className="grid-2">
            {(["ghn", "vtp"] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`m-${k}`}>Báo phí {k === "ghn" ? "GHN" : "Viettel Post"}</label>
                <select id={`m-${k}`} className="select" value={st?.[k] ?? "ok"} onChange={(e) => sim({ action: "toggle", key: k, value: e.target.value }, `Báo phí ${k}`)}>
                  {MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={Boolean(st?.waybillFail)} onChange={(e) => sim({ action: "toggle", key: "waybillFail", value: e.target.checked }, "API tạo vận đơn lỗi")} />API tạo vận đơn bị lỗi</label>
          <label className="check"><input type="checkbox" checked={Boolean(st?.carrierPickedUp)} onChange={(e) => sim({ action: "toggle", key: "carrierPickedUp", value: e.target.checked }, "ĐVVC đã lấy hàng")} />ĐVVC báo đã lấy hàng khi khách hủy</label>
          <label className="check"><input type="checkbox" checked={Boolean(st?.sepayDisabled)} onChange={(e) => sim({ action: "toggle", key: "sepayDisabled", value: e.target.checked }, "SePay gián đoạn")} />Kết nối SePay gián đoạn (MSG-06)</label>
          <label className="check"><input type="checkbox" checked={Boolean(st?.mailFailNext)} onChange={(e) => sim({ action: "toggle", key: "mailFailNext", value: e.target.checked }, "Email lỗi")} />Gửi email lỗi ở lần tiếp theo</label>
          <div className="row-actions">
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "retryMail" }, "Gửi lại email lỗi")}>Gửi lại email lỗi ngay</button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => { if (confirm("Xóa toàn bộ đơn, phiên và đưa dữ liệu về ban đầu?")) sim({ action: "reset" }, "Đặt lại dữ liệu"); }}>Đặt lại dữ liệu mẫu</button>
          </div>
          <p className="help">Địa chỉ Tỉnh Lai Châu: cả hai hãng không phục vụ (MSG-02). SĐT 0909000000 bị chặn COD tự động. MOTLAN đã được SĐT 0912345678 dùng.</p>
        </section>

        <section className="stock dev-panel">
          <h2>Phiên thanh toán SePay (NFP)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Phiên</th><th>Khách</th><th>Tổng</th><th>Trạng thái</th><th>Hết hạn</th><th>Giả lập chuyển khoản</th></tr></thead>
              <tbody>
                {s?.sessions.length === 0 && <tr><td colSpan={6}>Chưa có phiên. Chọn chuyển khoản ở Bước 3 rồi bấm Thanh toán.</td></tr>}
                {s?.sessions.map((x) => (
                  <tr key={x.code}>
                    <td><Link href={`/pay/${x.code}?t=${x.token}`} target="_blank">{x.code}</Link>{x.orderCode && <><br /><span className="line-meta">→ {x.orderCode}</span></>}</td>
                    <td>{x.customer.name}</td>
                    <td>{formatVnd(x.money.total)}</td>
                    <td>{SESSION_VI[x.status]}</td>
                    <td>{formatDateTime(x.expiresAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-sm" onClick={() => sim({ action: "transfer", sessionCode: x.code }, "Chuyển đúng")}>Chuyển đúng</button>
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code, kind: "short" }, "Thiếu 10.000đ")}>Thiếu tiền</button>
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code, kind: "over" }, "Thừa 10.000đ")}>Thừa tiền</button>
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code, kind: "nocode" }, "Thiếu mã")}>Thiếu mã</button>
                        {x.status === "pending" && <>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code, kind: "missed" }, "Tiền về, webhook lỡ")}>Webhook bị lỡ</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "shorten", sessionCode: x.code }, "Còn 20 giây")}>Còn 20 giây</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "expire", sessionCode: x.code }, "Hết hạn ngay")}>Hết hạn ngay</button>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code, kind: "late" }, "Tiền đến muộn")}>Tiền đến muộn</button>
                        </>}
                        {x.status !== "pending" && x.status !== "paid" && <button type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "transfer", sessionCode: x.code }, "Tiền đến muộn")}>Tiền đến muộn</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Đơn hàng và trạng thái giao (webhook GHN / VTP)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Mã đơn</th><th>PT</th><th>Trạng thái</th><th>Vận đơn</th><th>Tổng</th><th>Giả lập ĐVVC</th></tr></thead>
              <tbody>
                {s?.orders.length === 0 && <tr><td colSpan={6}>Chưa có đơn. <Link href="/">Đặt một đơn</Link> để bắt đầu.</td></tr>}
                {s?.orders.map((o) => (
                  <tr key={o.code}>
                    <td>{o.code}<br /><span className="line-meta">{o.customer.name}</span></td>
                    <td>{o.method === "cod" ? "COD" : "SePay"}</td>
                    <td>{STATUS_VI[o.status]}</td>
                    <td>{o.shipment.trackingCode ? `${o.shipment.carrier} ${o.shipment.trackingCode}` : o.shipment.error ? <span className="error-text">{o.shipment.error}</span> : "—"}</td>
                    <td>{formatVnd(o.money.total)}</td>
                    <td>{o.shipment.trackingCode && (
                      <div className="row-actions">
                        {CARRIER_STEPS.map(([k, t]) => <button key={k} type="button" className="btn btn-sm btn-quiet" onClick={() => sim({ action: "carrier", code: o.code, step: k }, `${o.code} ${t}`)}>{t}</button>)}
                      </div>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Giao dịch cần đối soát</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Giao dịch</th><th>Lúc nhận</th><th>Số tiền</th><th>Phiên</th><th>Lý do</th><th>Xử lý</th></tr></thead>
              <tbody>
                {s?.recon.length === 0 && <tr><td colSpan={6}>Chưa có giao dịch nào.</td></tr>}
                {s?.recon.map((r) => (
                  <tr key={r.transactionId}>
                    <td>{r.transactionId}</td><td>{formatDateTime(r.receivedAt)}</td>
                    <td>{formatVnd(r.amount)}{r.expectedAmount != null && <><br /><span className="line-meta">Cần {formatVnd(r.expectedAmount)}</span></>}</td>
                    <td>{r.sessionCode ?? "—"}</td><td>{RECON_VI[r.reason]}{r.lateMinutes ? ` ${r.lateMinutes} phút` : ""}</td>
                    <td>{r.status === "open" ? <Link href="/admin#recon">Kế toán xử lý</Link> : r.status === "order_created" ? `Đã tạo ${r.orderCode}` : "Đã hoàn tiền"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Hộp thư giả lập (EM-01…EM-05)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Mốc</th><th>Gửi đến</th><th>Tiêu đề</th><th>Trạng thái</th><th>Lần gửi</th><th>Thời điểm</th></tr></thead>
              <tbody>
                {s?.outbox.length === 0 && <tr><td colSpan={6}>Chưa có email.</td></tr>}
                {s?.outbox.map((m) => (
                  <tr key={m.id}>
                    <td>{m.event}</td><td>{m.to}</td>
                    <td><a href={`/dev/mail/${encodeURIComponent(m.id)}`} target="_blank" rel="noopener">{m.subject}</a></td>
                    <td>{m.status === "sent" ? "Đã gửi" : m.status === "failed" ? `Lỗi, sẽ gửi lại (${m.lastError})` : "Ngừng, CSKH gọi điện"}</td>
                    <td>{m.attempts}</td><td>{formatDateTime(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Tồn kho và giá</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn khả dụng</th><th>Giá bán</th></tr></thead>
              <tbody>
                {s?.variants.map((v) => (
                  <tr key={v.id}>
                    <td>{v.sku}</td><td>{v.name}</td>
                    <td><input className="input" style={{ width: 90, minHeight: 36 }} type="number" min={0} defaultValue={v.stock} key={`s${v.stock}`} aria-label={`Tồn kho ${v.sku}`}
                      onBlur={(e) => Number(e.target.value) !== v.stock && sim({ action: "setStock", variantId: v.id, stock: Number(e.target.value) }, `Tồn ${v.sku}`)} /></td>
                    <td><input className="input" style={{ width: 130, minHeight: 36 }} type="number" min={0} step={1000} defaultValue={v.price} key={`p${v.price}`} aria-label={`Giá ${v.sku}`}
                      onBlur={(e) => Number(e.target.value) !== v.price && sim({ action: "setPrice", variantId: v.id, price: Number(e.target.value) }, `Giá ${v.sku}`)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stock dev-panel">
          <h2>Mã giảm giá mẫu (SRS III.4)</h2>
          <ul className="help">
            <li>GIAM10: 10%, tối đa 80.000đ, đơn từ 500.000đ</li>
            <li>GIAM100K: giảm 100.000đ, đơn từ 800.000đ</li>
            <li>FREESHIP: giảm phí giao tối đa 30.000đ</li>
            <li>NAM15: 15% hàng Nam, tối đa 150.000đ</li>
            <li>KHONGSALE: 20%, không áp hàng Sale</li>
            <li>HETHAN, SAPMO: hết hạn, chưa mở</li>
            <li>HETLUOT, MOTLAN: mã ẩn, gõ tay để thử (hết lượt; 50.000đ mỗi SĐT 1 lần)</li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
