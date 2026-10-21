/**
 * Guardia de los permisos de las tablas nuevas de `public` (aviso de Supabase del 2026-10-20).
 * Se corre con `npm run check-grants`: no hay CI ni hook de pre-commit que la corra sola.
 *
 * LA REGLA: una migración nueva que crea una tabla o una vista en `public` le da sus permisos ahí:
 *
 *   grant select, insert, update, delete on public.mi_tabla to authenticated, service_role;
 *
 * (y su RLS, como siempre: el grant deja llegar a la tabla, la RLS decide qué filas ve cada uno).
 * `anon` no se da: la app lee siempre con la sesión del usuario o con el servidor (el cron); la
 * clave pública sin sesión sólo hace el login. Si algún día una página pública lee una tabla sin
 * sesión, esa tabla lleva además `grant select … to anon` y su policy para anon.
 *
 * POR QUÉ: desde el 2026-10-30 Supabase deja de darle permisos solos a lo que se crea en `public`.
 * Hasta la 0010 todo se creó con los permisos automáticos, que PROD conserva; la 0011 los escribe
 * explícitos para lo que se arme de cero, sin permisos por defecto. Una tabla nueva sin grant queda
 * inaccesible en PROD: la app y el cron reciben «permission denied». Esto lo frena antes.
 *
 * Mira las migraciones de la 0011 en adelante (schema.sql es la base, de antes) y las de antes que
 * todavía no están en PROD (PENDIENTES_DE_PROD): ésas frenan en el PR a main y, si no, sólo avisan.
 * Una tabla que sólo usa el servidor va a SOLO_SERVIDOR con su porqué: le alcanza con service_role.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { revisarMigraciones, ROLES_NECESARIOS } from "./lib/grants-migracion.mjs";

/** Desde qué migración rige: la primera escrita después del aviso de Supabase. */
const DESDE = 11;

/**
 * Migraciones de antes de la 0011 que todavía no están en PROD. Censado el 2026-10-20: el remoto
 * tiene una sola rama (main) y ninguna migración afuera de ella, así que no hay ninguna.
 */
const PENDIENTES_DE_PROD = new Set([]);

/** Tablas o vistas que sólo usa el servidor: { "tabla": "por qué" }. */
const SOLO_SERVIDOR = new Map([
  // ["mi_tabla", "la escribe y la lee sólo el cron X con la service key"],
]);

/** El PR a producción (main): ahí lo pendiente también frena. Hoy no hay CI que lo fije. */
const HACIA_PROD = process.env.GITHUB_BASE_REF === "main";

const DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const migraciones = readdirSync(DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort()
  .map((nombre) => ({ nombre, sql: readFileSync(join(DIR, nombre), "utf8") }));

const { problemas, avisos, miradas } = revisarMigraciones(migraciones, {
  desde: DESDE,
  pendientesDeProd: PENDIENTES_DE_PROD,
  soloServidor: new Set(SOLO_SERVIDOR.keys()),
  haciaProd: HACIA_PROD,
});

const renglon = (p) =>
  `${p.archivo}: ${p.tipo} public.${p.nombre} — le falta grant a ${p.faltan.join(" y ")}`;
const comoArreglarlo =
  "Agregá en la misma migración:\n" +
  `  grant select, insert, update, delete on public.<tabla> to ${ROLES_NECESARIOS.join(", ")};\n` +
  "Si se lee sin sesión (una página pública), también `grant select on public.<tabla> to anon;` " +
  "y su policy para anon.\n" +
  "Si sólo la usa el servidor, sumala a SOLO_SERVIDOR en scripts/check-grants.mjs con su porqué.";

for (const p of avisos) {
  const texto = `${renglon(p)} (todavía no está en PROD: cuando vaya, va a ser después del 30/10; en el PR a main frena)`;
  // En un CI de GitHub, como anotación: se ve en la corrida sin dejarla roja.
  console.error(
    process.env.GITHUB_ACTIONS === "true" ? `::warning title=check-grants::${texto}` : `aviso: ${texto}`,
  );
}

if (problemas.length) {
  console.error(
    "check-grants: tablas o vistas nuevas en public sin sus permisos (desde el 30/10 Supabase no los da solos):\n",
  );
  for (const p of problemas) console.error(`  ${renglon(p)}`);
  console.error(`\n${comoArreglarlo}`);
  process.exit(1);
}

const cuantas =
  `${miradas} migraci${miradas === 1 ? "ón" : "ones"}: ` +
  `las de la ${String(DESDE).padStart(4, "0")} en adelante y las que faltan en PROD`;
console.log(
  avisos.length
    ? `check-grants: limpio, con ${avisos.length} aviso${avisos.length === 1 ? "" : "s"} (${cuantas}).`
    : `check-grants: limpio (${cuantas}).`,
);
