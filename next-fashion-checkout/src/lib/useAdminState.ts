"use client";
import { useCallback, useEffect, useState } from "react";
import type { IntegrationLog, Mail, Order, PaymentSession, ReconItem, RefundRequest, Settings } from "./types";

export type AdminOrder = Omit<Order, "idempotencyKey" | "token"> & { expectedWeight: number };
export type AdminState = {
  orders: AdminOrder[];
  sessions: Omit<PaymentSession, "idempotencyKey">[];
  recon: ReconItem[];
  refunds: RefundRequest[];
  logs: IntegrationLog[];
  outbox: Omit<Mail, "html">[];
  settings: Settings;
  variants: { id: string; sku: string; name: string; stock: number; price: number }[];
  phones: Record<string, string>;
};

// Trạng thái chung cho bảng giả lập và màn hình nội bộ, tự làm mới mỗi 3 giây
export function useAdminState() {
  const [s, setS] = useState<AdminState | null>(null);
  const [log, setLog] = useState("");
  const load = useCallback(() => fetch("/api/admin", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  const call = useCallback(async (url: string, body: object, label: string) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "network" }));
    setLog(`${new Date().toLocaleTimeString("vi-VN")} · ${label}: ${JSON.stringify(r.outcome ?? r)}`.slice(0, 300));
    load();
    return r;
  }, [load]);
  return {
    s, log, load,
    admin: (body: object, label: string) => call("/api/admin", body, label),
    sim: (body: object, label: string) => call("/api/dev/action", body, label),
  };
}

export const STATUS_VI: Record<string, string> = {
  pending_confirmation: "Chờ xác nhận", paid: "Đã thanh toán", packing: "Chờ đóng gói", awaiting_pickup: "Chờ lấy hàng",
  shipping: "Đang giao", delivery_failed: "Giao thất bại", delivered: "Đã giao", returned: "Đã hoàn hàng", canceled: "Đã hủy",
};
export const SESSION_VI: Record<string, string> = { pending: "Chờ thanh toán", paid: "Đã thanh toán", expired: "Hết hạn", closed: "Đã đóng (đổi COD)" };
export const RECON_VI: Record<string, string> = { short: "Thiếu tiền", over: "Thừa tiền", missing_code: "Thiếu mã", late: "Đến muộn", unknown_session: "Không tìm thấy phiên" };
