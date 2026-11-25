import { NextResponse } from "next/server";
import { DEMO_MEMBER } from "@/lib/data/coupons";
import { db } from "@/lib/store";
import { currentMemberId } from "@/lib/api";

export const dynamic = "force-dynamic";

// Thành viên mẫu + thông tin đã lưu từ lần trước ("Lưu thông tin cho lần sau")
export async function GET() {
  const id = await currentMemberId();
  if (!id) return NextResponse.json({ member: null });
  return NextResponse.json({ member: DEMO_MEMBER, saved: db().savedProfiles[id] ?? null });
}
