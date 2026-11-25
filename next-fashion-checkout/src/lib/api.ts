import { cookies } from "next/headers";
import { DEMO_MEMBER } from "./data/coupons";
import { db } from "./store";

export async function currentMemberId() {
  const id = (await cookies()).get("nf_member")?.value;
  return id === DEMO_MEMBER.id ? id : undefined;
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}

// Tham số công khai cho giao diện (thanh thông báo, ràng buộc phương thức)
export function publicSettings() {
  const s = db().settings;
  return {
    freeshipThreshold: s.freeshipThreshold, codCap: s.codCap, autoConfirmCap: s.autoConfirmCap, vatRate: s.vatRate,
    sessionMinutes: s.sessionMinutes, quoteMaxAgeMinutes: s.quoteMaxAgeMinutes, sepayAvailable: !s.sepayDisabled,
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;
