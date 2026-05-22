"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function LogoutButton() {
  const router = useRouter();
  async function salir() {
    await fetch("/api/empleado-logout", { method: "POST" });
    router.push("/fichar");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="sm" onClick={salir}>
      Salir
    </Button>
  );
}
