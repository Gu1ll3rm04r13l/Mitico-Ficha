"use client";

import Link from "next/link";
import type { Employee } from "@/lib/fichaje/types";

type EmpleadoCard = Pick<
  Employee,
  "id" | "nombre" | "apellido" | "rol" | "modalidad_pago" | "foto_perfil_url"
>;

function iniciales(nombre: string, apellido: string | null): string {
  return `${nombre.charAt(0)}${apellido?.charAt(0) ?? ""}`.toUpperCase();
}

// TEMPORAL — solo testeo. PINs del seed (scripts/seed-empleados.mjs). Borrar
// este map y su uso abajo antes de producción.
const PINS_TEST: Record<string, string> = {
  Lucía: "1111",
  Marcos: "2222",
  Sofía: "3333",
  Diego: "4444",
  Valentina: "5555",
};

export function EmployeeGrid({ empleados }: { empleados: EmpleadoCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {empleados.map((e) => (
        <Link
          key={e.id}
          href={`/fichar/${e.id}`}
          className="flex flex-col items-center gap-3 rounded-2xl bg-bg-card border border-muted/15 p-5 transition active:scale-95 hover:border-accent/60"
        >
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-accent/20">
            {e.foto_perfil_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.foto_perfil_url}
                alt={e.nombre}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-heading text-3xl text-accent">
                {iniciales(e.nombre, e.apellido)}
              </span>
            )}
          </div>
          <span className="text-center font-heading text-xl leading-tight text-cream">
            {e.nombre}
          </span>
          {e.rol && (
            <span className="-mt-2 text-xs text-muted">{e.rol}</span>
          )}
          {/* TEMPORAL — solo testeo. Borrar antes de producción. */}
          {PINS_TEST[e.nombre] && (
            <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              PIN {PINS_TEST[e.nombre]}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
