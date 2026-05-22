import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RolApp } from "./types";

export interface StaffSession {
  userId: string;
  email: string | null;
  rol: RolApp;
}

// Devuelve la sesión staff actual (admin/jefe/encargado) o null.
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .schema("fichaje")
    .from("app_users")
    .select("rol")
    .eq("user_id", user.id)
    .maybeSingle();

  const rol = data?.rol as RolApp | undefined;
  if (rol !== "admin" && rol !== "jefe" && rol !== "encargado") return null;

  return { userId: user.id, email: user.email ?? null, rol };
}
