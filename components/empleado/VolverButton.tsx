"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Vuelve a la pantalla anterior (típicamente el flujo de fichaje) sin cerrar sesión.
export function VolverButton() {
  const router = useRouter();
  return (
    <Button variant="secondary" size="sm" onClick={() => router.back()}>
      ← Volver
    </Button>
  );
}
