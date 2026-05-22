"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarRol } from "@/lib/fichaje/mutations";
import type { CuentaDetalle } from "@/lib/fichaje/admin";
import type { RolApp } from "@/lib/fichaje/types";

const ROLES: RolApp[] = ["admin", "jefe", "encargado", "empleado"];

export function RoleManager({
  cuentas,
  puedeEditar,
  miUserId,
}: {
  cuentas: CuentaDetalle[];
  puedeEditar: boolean;
  miUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(userId: string, rol: RolApp) {
    setError(null);
    start(async () => {
      const r = await cambiarRol(userId, rol);
      if (r.ok) router.refresh();
      else setError(r.error ?? "Error");
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-muted/15">
      {error && (
        <p className="bg-red-900/30 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      <table className="w-full text-sm">
        <thead className="bg-bg-card text-muted">
          <tr>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Empleado</th>
            <th className="px-4 py-3 text-left">Rol</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => {
            const esYo = c.user_id === miUserId;
            return (
              <tr key={c.user_id} className="border-t border-muted/10">
                <td className="px-4 py-3 text-cream">
                  {c.email ?? "—"} {esYo && <span className="text-muted">(vos)</span>}
                </td>
                <td className="px-4 py-3 text-muted">
                  {c.empleadoNombre ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {puedeEditar && !esYo ? (
                    <select
                      defaultValue={c.rol}
                      disabled={pending}
                      onChange={(e) =>
                        onChange(c.user_id, e.target.value as RolApp)
                      }
                      className="rounded-lg bg-bg-deep border border-muted/30 px-2 py-1 text-cream"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-cream">{c.rol}</span>
                  )}
                </td>
              </tr>
            );
          })}
          {cuentas.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-muted">
                No hay cuentas staff todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
