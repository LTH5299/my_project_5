import { db } from "./store";
import type { IntegrationLog } from "./types";

// Nhật ký tích hợp (NFR-10): mỗi lời gọi/nhận API của đối tác. Che SĐT, chỉ giữ 3 số cuối (NFR-09).
export function logCall(entry: Omit<IntegrationLog, "at"> & { at?: string }) {
  const logs = db().logs;
  logs.unshift({ at: entry.at ?? new Date().toISOString(), ...entry });
  if (logs.length > 500) logs.length = 500;
}

export const maskPhone = (p: string) => (p.length > 3 ? "*".repeat(p.length - 3) + p.slice(-3) : p);
