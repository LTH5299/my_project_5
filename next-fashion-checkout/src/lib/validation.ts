// Kiểm tra Bước 1 – Thông tin nhận hàng (SRS v1.2 BR-02.1). Dùng chung cho trình duyệt và máy chủ.

export type FieldError =
  | "name_invalid" | "phone_format" | "email_format" | "address_short" | "address_long"
  | "address_meaningless" | "note_long" | "province_required" | "ward_required";

export const NOTE_MAX = 200;

export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  else if (p.startsWith("84") && p.length === 11) p = "0" + p.slice(2);
  return p;
}

// 2–50 ký tự chữ (cho phép dấu tiếng Việt, khoảng trắng, dấu nháy, gạch nối)
export function validateName(v: string): FieldError | null {
  const s = v.trim();
  if (s.length < 2 || s.length > 50 || !/^[\p{L}][\p{L}\s'.-]*$/u.test(s)) return "name_invalid";
  return null;
}

export function validatePhone(v: string): FieldError | null {
  return /^0[0-9]{9}$/.test(normalizePhone(v)) ? null : "phone_format";
}

export function validateEmail(v: string): FieldError | null {
  const s = v.trim();
  return s.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? null : "email_format";
}

export function validateAddressLine(v: string): FieldError | null {
  const s = v.trim();
  if (s.length < 5) return "address_short";
  if (s.length > 200) return "address_long";
  if (!/\p{L}/u.test(s)) return "address_meaningless";
  return null;
}

export interface ContactInput { name: string; phone: string; email: string; provinceId: string; wardId: string; line: string; note: string }

export function validateContact(c: ContactInput): Partial<Record<keyof ContactInput, FieldError>> {
  const e: Partial<Record<keyof ContactInput, FieldError>> = {};
  const n = validateName(c.name); if (n) e.name = n;
  const p = validatePhone(c.phone); if (p) e.phone = p;
  const m = validateEmail(c.email); if (m) e.email = m;
  if (!c.provinceId) e.provinceId = "province_required";
  if (!c.wardId) e.wardId = "ward_required";
  const l = validateAddressLine(c.line); if (l) e.line = l;
  if (c.note.length > NOTE_MAX) e.note = "note_long";
  return e;
}
