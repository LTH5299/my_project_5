import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEMO_MEMBER } from "@/lib/data/coupons";

export const dynamic = "force-dynamic";

export async function GET() {
  const id = (await cookies()).get("nf_member")?.value;
  return NextResponse.json({ member: id === DEMO_MEMBER.id ? DEMO_MEMBER : null });
}
