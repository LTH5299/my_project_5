// Quy tắc nhập liệu thông tin nhận hàng (REQ-A7.1.1, A7.1.3, A7.1.4). Dùng chung cho
// trình duyệt và máy chủ để báo lỗi giống nhau ở cả hai phía.

export type FieldError =
  | "required"
  | "name_length"
  | "name_digits"
  | "phone_format"
  | "email_format"
  | "address_short"
  | "address_long"
  | "address_meaningless"
  | "note_long"
  | "province_required"
  | "ward_required";

export const NOTE_MAX = 250;

export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  else if (p.startsWith("84") && p.length === 11) p = "0" + p.slice(2);
  return p;
}

export function validateName(v: string): FieldError | null {
  const s = v.trim();
  if (!s) return "required";
  if (/\d/.test(s)) return "name_digits";
  if (s.length < 2 || s.length > 50) return "name_length";
  return null;
}

// Đầu số di động Việt Nam: 03, 05, 07, 08, 09
export function validatePhone(v: string): FieldError | null {
  const p = normalizePhone(v);
  if (!p) return "required";
  if (!/^0(3|5|7|8|9)\d{8}$/.test(p)) return "phone_format";
  return null;
}

export function validateEmail(v: string): FieldError | null {
  const s = v.trim();
  if (!s) return "required";
  if (s.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "email_format";
  return null;
}

export function validateAddressLine(v: string): FieldError | null {
  const s = v.trim();
  if (s.length < 5) return "address_short";
  if (s.length > 200) return "address_long";
  // Không được chỉ gồm số hoặc ký tự đặc biệt: phải có ít nhất một chữ cái (kể cả có dấu)
  if (!/\p{L}/u.test(s)) return "address_meaningless";
  return null;
}

export function validateNote(v: string): FieldError | null {
  return v.length > NOTE_MAX ? "note_long" : null;
}

export interface ContactInput {
  name: string;
  phone: string;
  email: string;
  provinceId: string;
  wardId: string;
  line: string;
  note: string;
}

export function validateContact(c: ContactInput): Partial<Record<keyof ContactInput, FieldError>> {
  const e: Partial<Record<keyof ContactInput, FieldError>> = {};
  const n = validateName(c.name); if (n) e.name = n;
  const p = validatePhone(c.phone); if (p) e.phone = p;
  const m = validateEmail(c.email); if (m) e.email = m;
  if (!c.provinceId) e.provinceId = "province_required";
  if (!c.wardId) e.wardId = "ward_required";
  const l = validateAddressLine(c.line); if (l) e.line = l;
  const no = validateNote(c.note); if (no) e.note = no;
  return e;
}
