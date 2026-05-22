// Crea el admin master inicial. Correr UNA vez tras completar SUPABASE_SERVICE_ROLE_KEY.
// Uso: node scripts/seed-admin.mjs <email> <password>
// Ej:  node scripts/seed-admin.mjs arieldelfresno2690@gmail.com MiClaveSegura123
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Carga .env.local sin dependencias.
function loadEnv() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  } catch {}
}
loadEnv();

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Uso: node scripts/seed-admin.mjs <email> <password>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || serviceKey.includes("PEGAR")) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: created, error: cErr } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (cErr) {
  console.error("Error creando usuario:", cErr.message);
  process.exit(1);
}

const userId = created.user.id;
const { error: auErr } = await sb
  .schema("fichaje")
  .from("app_users")
  .upsert({ user_id: userId, rol: "admin" });
if (auErr) {
  console.error("Usuario creado pero falló asignar rol admin:", auErr.message);
  process.exit(1);
}

console.log(`✓ Admin master creado: ${email} (user_id ${userId})`);
console.log("  Entrá en /login con ese email y contraseña.");
