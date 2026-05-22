import { redirect } from "next/navigation";

// El celular del local arranca directo en el fichaje.
export default function Home() {
  redirect("/fichar");
}
