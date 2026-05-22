import { listarCuentasDetalle, listarEmpleados } from "@/lib/fichaje/admin";
import { getStaffSession } from "@/lib/fichaje/auth";
import { RoleManager } from "@/components/admin/RoleManager";
import { NuevaCuentaStaff } from "@/components/admin/NuevaCuentaStaff";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const [cuentas, empleados, session] = await Promise.all([
    listarCuentasDetalle(),
    listarEmpleados(),
    getStaffSession(),
  ]);
  const esAdmin = session?.rol === "admin";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-4xl text-cream">Cuentas</h1>
        {esAdmin && (
          <NuevaCuentaStaff
            empleados={empleados.map((e) => ({ id: e.id, nombre: e.nombre }))}
          />
        )}
      </div>

      {!esAdmin && (
        <p className="rounded-lg bg-bg-card px-4 py-3 text-sm text-muted">
          Solo el admin puede crear cuentas o cambiar roles. Podés ver la lista.
        </p>
      )}

      <RoleManager
        cuentas={cuentas}
        puedeEditar={esAdmin}
        miUserId={session?.userId ?? ""}
      />
    </div>
  );
}
