"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { crearCuentaStaff } from "@/lib/fichaje/mutations";

export function NuevaCuentaStaff({
  empleados,
}: {
  empleados: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await crearCuentaStaff(fd);
      if (r.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(r.error ?? "Error");
    });
  }

  if (!abierto) {
    return <Button onClick={() => setAbierto(true)}>+ Cuenta staff</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-card p-6">
        <h2 className="mb-4 font-heading text-2xl text-cream">
          Nueva cuenta staff
        </h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input name="email" label="Email" type="email" required />
          <Input
            name="password"
            label="Contraseña (6+ caracteres)"
            type="password"
            required
          />
          <Select name="rol" label="Rol" defaultValue="encargado">
            <option value="encargado">Encargado</option>
            <option value="jefe">Jefe</option>
            <option value="admin">Admin</option>
          </Select>
          <Select name="employee_id" label="Vincular a empleado (opcional)" defaultValue="">
            <option value="">— Ninguno —</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Creando…" : "Crear cuenta"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
