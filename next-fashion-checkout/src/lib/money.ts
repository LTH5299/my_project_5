import type { Lang } from "./types";

// Định dạng VNĐ, không số thập phân (REQ-A6.3.2)
export function formatVnd(n: number, lang: Lang = "vi") {
  const s = Math.round(n).toLocaleString(lang === "vi" ? "vi-VN" : "en-US");
  return lang === "vi" ? `${s}đ` : `${s}₫`;
}

export function formatTime(iso: string, lang: Lang = "vi") {
  return new Date(iso).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatDateTime(iso: string, lang: Lang = "vi") {
  return new Date(iso).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
  });
}
