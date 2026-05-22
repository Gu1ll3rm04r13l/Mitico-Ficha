import Link from "next/link";
import { getEmpleadosActivos } from "@/lib/fichaje/queries";
import { EmployeeGrid } from "@/components/fichaje/EmployeeGrid";

export const dynamic = "force-dynamic";

export default async function FicharPage() {
  const empleados = await getEmpleadosActivos();

  return (
    // Columna a pantalla completa: contenido scrollea, barra queda abajo siempre visible.
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <header className="mb-8 text-center">
          <Link href="/fichar">
            <h1 className="font-heading text-5xl text-accent">MÍTICO</h1>
          </Link>
          <p className="mt-1 text-muted">Tocá tu nombre para fichar</p>
        </header>

        {empleados.length === 0 ? (
          <p className="text-center text-muted">
            No hay empleados cargados todavía. Tocá “Crear cuenta” para darte de
            alta.
          </p>
        ) : (
          <EmployeeGrid empleados={empleados} />
        )}
      </main>

      {/* Barra inferior pegajosa (mobile-first), respeta safe-area del dispositivo */}
      <nav
        aria-label="Acceso de cuenta"
        className="sticky bottom-0 z-40 border-t border-muted/15 bg-bg-deep/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl gap-3 px-4 py-3">
          <Link
            href="/registro"
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-accent font-semibold text-bg-deep transition-colors active:brightness-95"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="flex h-12 flex-1 items-center justify-center rounded-xl border border-muted/30 text-cream transition-colors hover:border-accent/60"
          >
            Iniciar sesión
          </Link>
        </div>
      </nav>
    </div>
  );
}
