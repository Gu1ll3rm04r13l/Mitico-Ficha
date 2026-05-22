"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { crearEmpleado } from "@/lib/fichaje/mutations";

export function NuevoEmpleado() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await crearEmpleado(fd);
      if (r.ok) {
        setAbierto(false);
        router.refresh();
      } else {
        setError(r.error ?? "Error");
      }
    });
  }

  if (!abierto) {
    return <Button onClick={() => setAbierto(true)}>+ Nuevo empleado</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-card p-6">
        <h2 className="mb-4 font-heading text-2xl text-cream">Nuevo empleado</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input name="nombre" label="Nombre" required />
          <Input name="apellido" label="Apellido (opcional)" />
          <Input name="rol" label="Puesto (mozo, pizzero…)" />
          <Select name="modalidad" label="Modalidad de pago" defaultValue="jornada">
            <option value="jornada">Jornada completa</option>
            <option value="horas">Por hora</option>
            <option value="mixto">Mixto</option>
          </Select>
          <Input
            name="pin"
            label="PIN inicial (opcional, 4-8 dígitos)"
            type="text"
            inputMode="numeric"
            hint="El empleado lo usa para ver su historial. Puede dejarse vacío."
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
