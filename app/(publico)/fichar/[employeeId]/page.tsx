import { notFound } from "next/navigation";
import Link from "next/link";
import { getEmpleado } from "@/lib/fichaje/queries";
import { FichajeFlow } from "@/components/fichaje/FichajeFlow";

export const dynamic = "force-dynamic";

export default async function FicharEmpleadoPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const empleado = await getEmpleado(employeeId);
  if (!empleado || !empleado.activo) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/fichar" className="mb-6 inline-block text-sm text-muted">
        ← Volver
      </Link>
      <FichajeFlow
        empleadoId={empleado.id}
        nombre={empleado.nombre}
        modalidad={empleado.modalidad_pago}
        tienePin={!!empleado.pin_hash}
      />
    </main>
  );
}
