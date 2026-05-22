import Link from "next/link";
import { CrearCuentaForm } from "@/components/fichaje/CrearCuentaForm";

export const dynamic = "force-dynamic";

// Alta de empleado nuevo: nombre + PIN. Accesible desde HOME (Crear cuenta).
export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <Link href="/fichar" className="mb-6 text-sm text-muted">
        ← Volver
      </Link>
      <Link href="/fichar" className="mb-1">
        <h1 className="font-heading text-5xl text-accent">MÍTICO</h1>
      </Link>
      <p className="mb-8 text-muted">Crear cuenta</p>

      <CrearCuentaForm />
    </main>
  );
}
