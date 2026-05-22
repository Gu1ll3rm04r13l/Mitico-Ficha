"use client";

import { useRouter } from "next/navigation";
import { format, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Select } from "@/components/ui/Input";

// Selector de los últimos 12 meses. Navega con ?mes=YYYY-MM.
export function MesSelector({ mes }: { mes: string }) {
  const router = useRouter();
  const ahora = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(ahora, i);
    return {
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: es }),
    };
  });

  return (
    <Select
      value={mes}
      onChange={(e) => router.push(`?mes=${e.target.value}`)}
      className="max-w-xs"
    >
      {meses.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}
