"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RolApp } from "@/lib/fichaje/types";

export function AdminNav({
  rol,
  email,
}: {
  rol: RolApp;
  email: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/admin", label: "Inicio" },
    { href: "/admin/empleados", label: "Empleados" },
    { href: "/admin/cuentas", label: "Cuentas" },
  ];

  async function salir() {
    await createClient().auth.signOut();
    router.push("/fichar");
    router.refresh();
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "inline-flex min-h-11 items-center rounded-lg px-3 transition",
            pathname === l.href
              ? "bg-accent text-bg-deep"
              : "text-muted hover:text-cream",
          )}
        >
          {l.label}
        </Link>
      ))}
      <span className="ml-2 hidden text-xs text-muted sm:inline">
        {email} · {rol}
      </span>
      <button
        onClick={salir}
        className="ml-1 inline-flex min-h-11 items-center rounded-lg px-3 text-muted hover:text-cream"
      >
        Salir
      </button>
    </nav>
  );
}
