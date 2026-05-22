"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes de cliente. Solo usa la anon key (segura en el browser).
// El schema `fichaje` se especifica por query con `.schema("fichaje")`.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
