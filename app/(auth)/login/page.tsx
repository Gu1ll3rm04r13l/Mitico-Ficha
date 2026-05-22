import Link from "next/link";
import { getEmpleadosActivos } from "@/lib/fichaje/queries";
import { LoginScreen } from "@/components/fichaje/LoginScreen";

export const dynamic = "force-dynamic";

// Acceso unificado: empleado (nombre + PIN) o jefe/admin (email + contraseña).
export default async function LoginPage() {
  const empleados = await getEmpleadosActivos();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <Link href="/fichar" className="mb-6 text-sm text-muted">
        ← Volver
      </Link>
      <Link href="/fichar" className="mb-1">
        <h1 className="font-heading text-5xl text-accent">MÍTICO</h1>
      </Link>
      <p className="mb-8 text-muted">Iniciá sesión</p>

      <LoginScreen
        empleados={empleados.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          apellido: e.apellido,
        }))}
      />
    </main>
  );
}
