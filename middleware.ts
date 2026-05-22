import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { verificarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/session";

// Protege /admin/* (staff con sesión Auth) y /mi-historial (sesión PIN).
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ----- /mi-historial: requiere cookie de sesión PIN válida -----
  if (pathname.startsWith("/mi-historial")) {
    const token = request.cookies.get(EMPLEADO_COOKIE)?.value;
    const empId = await verificarSesion(token);
    if (!empId) {
      // Sin sesión válida (expiró o no llegó la cookie): mandar a iniciar sesión,
      // NO a crear cuenta. Un empleado existente no debe terminar en el alta.
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ----- /admin/*: requiere sesión Auth + rol staff -----
  if (pathname.startsWith("/admin")) {
    const { supabaseResponse, supabase, user } = await updateSession(request);
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    // Verificar rol staff contra fichaje.app_users
    const { data } = await supabase
      .schema("fichaje")
      .from("app_users")
      .select("rol")
      .eq("user_id", user.id)
      .maybeSingle();

    const rol = data?.rol;
    if (rol !== "admin" && rol !== "jefe" && rol !== "encargado") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "sin_permiso");
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/mi-historial/:path*"],
};
