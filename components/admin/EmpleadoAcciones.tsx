"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  editarEmpleado,
  eliminarEmpleado,
  setEmpleadoActivo,
} from "@/lib/fichaje/mutations";
import type { Employee } from "@/lib/fichaje/types";

export function EmpleadoAcciones({ empleado }: { empleado: Employee }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await editarEmpleado(empleado.id, fd);
      if (r.ok) {
        setEditando(false);
        router.refresh();
      } else {
        setError(r.error ?? "Error");
      }
    });
  }

  function toggleActivo() {
    setError(null);
    start(async () => {
      const r = await setEmpleadoActivo(empleado.id, !empleado.activo);
      if (r.ok) router.refresh();
      else setError(r.error ?? "Error");
    });
  }

  function borrar() {
    setError(null);
    start(async () => {
      const r = await eliminarEmpleado(empleado.id);
      if (r.ok) {
        router.push("/admin/empleados");
        router.refresh();
      } else {
        setError(r.error ?? "Error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setEditando((v) => !v)}>
          {editando ? "Cerrar edición" : "Editar datos"}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleActivo} disabled={pending}>
          {empleado.activo ? "Desactivar" : "Reactivar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
          <span className="text-red-400">Eliminar</span>
        </Button>
      </div>

      {!empleado.activo && (
        <p className="text-sm text-accent-warm">
          Inactivo — no aparece en la pantalla de fichaje. Sus datos e historial
          se conservan.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {editando && (
        <form
          onSubmit={onEditar}
          className="grid gap-3 rounded-xl border border-muted/15 p-4 sm:grid-cols-3"
        >
          <Input name="nombre" label="Nombre" defaultValue={empleado.nombre} required />
          <Input
            name="apellido"
            label="Apellido"
            defaultValue={empleado.apellido ?? ""}
          />
          <Input
            name="rol"
            label="Puesto"
            defaultValue={empleado.rol ?? ""}
          />
          <div className="sm:col-span-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      )}

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-bg-card p-6">
            <h3 className="mb-2 font-heading text-2xl text-cream">
              Eliminar a {empleado.nombre} {empleado.apellido ?? ""}
            </h3>
            <p className="mb-4 text-sm text-muted">
              Esto borra al empleado <strong>y todos sus fichajes y fotos</strong>{" "}
              de forma permanente. No se puede deshacer. Si solo querés que no
              aparezca en el fichaje, usá <strong>Desactivar</strong> en su lugar.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setConfirmando(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={borrar}
                disabled={pending}
              >
                {pending ? "Eliminando…" : "Sí, eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
