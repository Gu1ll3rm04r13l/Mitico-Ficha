import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/session";

export const runtime = "nodejs";

// Alta de fichaje TARDÍO: el empleado, logueado en su historial, agrega un
// fichaje (entrada o salida) que se olvidó de marcar. Lleva selfie igual que
// uno normal, pero queda marcado con registrado_tarde=true para que el jefe lo
// distinga. Solo ALTA — nunca editar ni borrar.
//
// El timestamp lo arma el cliente (zona horaria del navegador) y lo manda en ISO.

const schema = z.object({
  timestamp: z.string().datetime(), // ISO, construido en el cliente
  tipo: z.enum(["entrada", "salida"]),
  tipo_jornada: z.enum(["completa", "extra"]).default("completa"),
  extra_modo: z.enum(["cuarto", "medio", "completo", "horas"]).nullable().optional(),
  nota: z.string().max(200).nullable().optional(),
  // Hermano que este fichaje cierra/abre cuando se completa un hueco puntual.
  enlace_id: z.string().uuid().nullable().optional(),
  foto_base64: z.string().min(100),
});

const MAX_ANTIGUEDAD_DIAS = 90;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(req: Request) {
  // Auth: sesión de empleado (cookie firmada), no PIN.
  const cookieStore = await cookies();
  const employeeId = await verificarSesion(
    cookieStore.get(EMPLEADO_COOKIE)?.value,
  );
  if (!employeeId) {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  // Validar el momento: ni futuro ni demasiado viejo.
  const cuando = new Date(input.timestamp);
  const ahora = Date.now();
  if (cuando.getTime() > ahora + 2 * 60_000) {
    return NextResponse.json(
      { error: "No podés cargar un fichaje en el futuro." },
      { status: 400 },
    );
  }
  if (ahora - cuando.getTime() > MAX_ANTIGUEDAD_DIAS * 86_400_000) {
    return NextResponse.json(
      { error: `Solo se pueden agregar fichajes de los últimos ${MAX_ANTIGUEDAD_DIAS} días.` },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, modalidad_pago")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) {
    return NextResponse.json({ error: "error de base" }, { status: 500 });
  }
  if (!emp || !emp.activo) {
    return NextResponse.json({ error: "empleado inactivo" }, { status: 404 });
  }

  // Reglas por modalidad (igual que el fichaje normal).
  let tipoJornada = input.tipo_jornada;
  let extraModo = input.extra_modo ?? null;
  if (input.tipo === "entrada") {
    if (emp.modalidad_pago === "jornada") {
      tipoJornada = "completa";
      extraModo = null;
    } else if (emp.modalidad_pago === "horas") {
      tipoJornada = "extra";
      extraModo = "horas";
    }
    // mixto: respeta lo que mandó la UI
  }
  // Para SALIDA tardía dejamos lo que mande la UI (default completa); el cálculo
  // empareja por día y la entrada correspondiente define el tipo real.

  // Si viene enlace_id, validar el hermano: mismo empleado, tipo opuesto y orden
  // temporal correcto (la entrada nunca puede ser posterior a su salida).
  let enlaceId: string | null = null;
  if (input.enlace_id) {
    const { data: hermano, error: hErr } = await db
      .from("time_records")
      .select("id, employee_id, tipo, timestamp")
      .eq("id", input.enlace_id)
      .maybeSingle();
    if (hErr) {
      return NextResponse.json({ error: "error de base" }, { status: 500 });
    }
    if (!hermano || hermano.employee_id !== employeeId) {
      return NextResponse.json(
        { error: "El fichaje a completar no existe." },
        { status: 400 },
      );
    }
    if (hermano.tipo === input.tipo) {
      return NextResponse.json(
        { error: "Ese hueco no corresponde a este tipo de fichaje." },
        { status: 400 },
      );
    }
    const entradaTs =
      input.tipo === "entrada" ? cuando.getTime() : new Date(hermano.timestamp).getTime();
    const salidaTs =
      input.tipo === "salida" ? cuando.getTime() : new Date(hermano.timestamp).getTime();
    if (salidaTs < entradaTs) {
      return NextResponse.json(
        {
          error:
            input.tipo === "salida"
              ? "La salida tiene que ser posterior a la entrada."
              : "La entrada tiene que ser anterior a la salida.",
        },
        { status: 400 },
      );
    }
    enlaceId = hermano.id;
  }

  // Subir selfie al bucket privado (carpeta del mes del fichaje cargado).
  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = input.timestamp.slice(0, 7); // YYYY-MM del momento declarado
    fotoPath = `${employeeId}/${ym}/${Date.now()}-tardio.${ext}`;
    const { error: upErr } = await svc.storage
      .from("fichaje-selfies")
      .upload(fotoPath, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: signed } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrl(fotoPath, 3600);
    fotoUrl = signed?.signedUrl ?? null;
  } catch {
    return NextResponse.json(
      { error: "no se pudo guardar la foto" },
      { status: 500 },
    );
  }

  const { error: insErr } = await db.from("time_records").insert({
    employee_id: employeeId,
    tipo: input.tipo,
    tipo_jornada: tipoJornada,
    extra_modo: extraModo,
    nota: input.nota ?? null,
    timestamp: cuando.toISOString(),
    foto_path: fotoPath,
    foto_url: fotoUrl,
    registrado_tarde: true,
    enlace_id: enlaceId,
  });
  if (insErr) {
    return NextResponse.json(
      { error: "no se pudo registrar el fichaje" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
