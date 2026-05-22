import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { EMPLEADO_COOKIE } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(EMPLEADO_COOKIE);
  return NextResponse.json({ ok: true });
}
