/**
 * Los permisos de lo que se crea en `public`. Puro: mira el texto de UNA migración.
 *
 * Desde el 2026-10-30 Supabase deja de darle permisos solos a lo que se crea en `public` (aviso del
 * 2026-10-20, github.com/orgs/supabase/discussions/45329): saca los permisos por defecto que tiene
 * `postgres` en ese schema para anon, authenticated y service_role. Una tabla o vista nueva sin
 * `grant` explícito queda inaccesible para la API: la app con la sesión del usuario (authenticated)
 * recibe «permission denied», y el cron con la service key (service_role), también: service_role
 * saltea la RLS, no los permisos. La RLS no cambia: sigue decidiendo QUÉ filas ve cada uno; el
 * grant decide si se puede llegar a la tabla.
 */

/**
 * El SQL con los comentarios (`-- …` y los de bloque, anidados como en Postgres) cambiados por
 * espacios: lo comentado no cuenta. Recorre el texto una vez: entre comillas simples o dobles, `--`
 * y `/*` no son comentarios. Lo que va entre `$…$` (el cuerpo de un `do` o de una función) se lee
 * como SQL, porque es código. Cada carácter queda en su lugar (mismo largo, mismos saltos de línea).
 *
 * No con dos reemplazos de regex: un `/*` dentro de un `--` (un camino como `scripts/*.mjs`) y un
 * `*\/` más adelante se tomaban como un comentario de bloque y borraban todo lo del medio, un
 * `create table` incluido: la guardia no lo veía. (Lo encontró la revisión de facturacion-sn,
 * 2026-10-20.)
 */
export function sinComentarios(sql) {
  sql = String(sql);
  const n = sql.length;
  let salida = "";
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") {
        salida += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      let nivel = 0;
      do {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          nivel++;
          salida += "  ";
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          nivel--;
          salida += "  ";
          i += 2;
        } else {
          salida += sql[i] === "\n" ? "\n" : " ";
          i++;
        }
      } while (i < n && nivel > 0);
      continue;
    }
    if (c === "'" || c === '"') {
      // E'…' acepta \' adentro; en el resto, la comilla se escapa duplicándola.
      const conBarra =
        c === "'" && /[eE]/.test(sql[i - 1] ?? "") && !/[A-Za-z0-9_$]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < n) {
        if (conBarra && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      salida += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const limpio = (s) => s.trim().replace(/^"|"$/g, "").toLowerCase();

/** Un nombre de objeto (`public.x`, `x`, `"public"."x"`) → { schema, nombre }. Sin schema, es de `public`. */
function partes(calificado) {
  const p = calificado.split(".").map(limpio);
  return p.length >= 2
    ? { schema: p[p.length - 2], nombre: p[p.length - 1] }
    : { schema: "public", nombre: p[0] };
}

/** Las tablas y vistas que la migración crea en `public` (las temporales no cuentan). */
export function objetosCreadosEnPublic(sql) {
  const s = sinComentarios(sql);
  const re = new RegExp(
    String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(unlogged|temporary|temp)\s+)?(table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(${IDENT}(?:\s*\.\s*${IDENT})?)`,
    "gi",
  );
  const vistos = new Map();
  for (const m of s.matchAll(re)) {
    if (m[1] && /^temp/i.test(m[1])) continue;
    const { schema, nombre } = partes(m[3].replace(/\s+/g, ""));
    if (schema !== "public") continue;
    if (!vistos.has(nombre)) {
      vistos.set(nombre, { nombre, tipo: m[2].toLowerCase().replace(/\s+/g, " ") });
    }
  }
  return [...vistos.values()];
}

/**
 * Los roles a los que la migración les da permisos sobre cada tabla de `public`:
 * `grant … on [table] a, b to r1, r2`. `grant … on all tables in schema public` cuenta para todas.
 * Devuelve { porTabla: Map<nombre, Set<rol>>, todas: Set<rol> }.
 */
export function grantsEnPublic(sql) {
  const s = sinComentarios(sql);
  const porTabla = new Map();
  const todas = new Set();
  const re = /\bgrant\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+to\s+([\s\S]+?)(?:\s+with\s+grant\s+option)?\s*;/gi;
  for (const m of s.matchAll(re)) {
    const objetos = m[2].trim();
    const roles = m[3]
      .split(",")
      .map((r) => limpio(r))
      .filter(Boolean);
    if (/^all\s+tables\s+in\s+schema\s+/i.test(objetos)) {
      const schemas = objetos.replace(/^all\s+tables\s+in\s+schema\s+/i, "").split(",").map(limpio);
      if (schemas.includes("public")) for (const r of roles) todas.add(r);
      continue;
    }
    // Sólo tablas: lo que dice sequence, function, schema… es otra cosa.
    if (
      /^(all\s+(sequences|functions|routines|procedures)\b|sequence\b|function\b|routine\b|procedure\b|schema\b|database\b|type\b|domain\b|foreign\b|large\b|tablespace\b|language\b)/i.test(
        objetos,
      )
    ) {
      continue;
    }
    for (const o of objetos.replace(/^table\s+/i, "").split(",")) {
      const { schema, nombre } = partes(o.replace(/\s+/g, ""));
      if (schema !== "public" || !nombre) continue;
      const set = porTabla.get(nombre) ?? new Set();
      for (const r of roles) set.add(r);
      porTabla.set(nombre, set);
    }
  }
  return { porTabla, todas };
}

/** Los roles que toda tabla o vista nueva de `public` necesita: la sesión del usuario y el servidor. */
export const ROLES_NECESARIOS = ["authenticated", "service_role"];

/**
 * Lo que le falta a cada tabla o vista que la migración crea en `public`:
 * [{ nombre, tipo, faltan: [rol] }], sólo las que tienen algo pendiente.
 * `soloServidor`: los nombres que sólo usa el servidor (les alcanza con service_role).
 */
export function faltanGrants(sql, soloServidor = new Set()) {
  const { porTabla, todas } = grantsEnPublic(sql);
  return objetosCreadosEnPublic(sql).flatMap((o) => {
    const propios = porTabla.get(o.nombre) ?? new Set();
    // «to public» es a todos los roles.
    const aTodos = todas.has("public") || propios.has("public");
    const tiene = new Set([...todas, ...propios, ...(aTodos ? ROLES_NECESARIOS : [])]);
    const necesarios = soloServidor.has(o.nombre) ? ["service_role"] : ROLES_NECESARIOS;
    const faltan = necesarios.filter((r) => !tiene.has(r));
    return faltan.length ? [{ ...o, faltan }] : [];
  });
}

/**
 * Revisa las migraciones ([{ nombre, sql }], `nombre` = «0012_algo.sql»). Mira las de `desde` en
 * adelante y las `pendientesDeProd`: las de antes que todavía no se aplicaron en PROD, que cuando
 * vayan será después del 30/10. Lo que le falta a una de `desde` en adelante FRENA siempre. A una
 * pendiente, frena sólo `haciaProd` (el PR a la rama de producción); en el resto, avisa.
 * Devuelve { problemas, avisos, miradas }.
 */
export function revisarMigraciones(
  migraciones,
  { desde, pendientesDeProd = new Set(), soloServidor = new Set(), haciaProd = false },
) {
  const problemas = [];
  const avisos = [];
  let miradas = 0;
  for (const { nombre, sql } of migraciones) {
    const deAntes = Number(nombre.slice(0, 4)) < desde;
    const pendiente = pendientesDeProd.has(nombre);
    if (deAntes && !pendiente) continue;
    miradas++;
    for (const f of faltanGrants(sql, soloServidor)) {
      (deAntes && !haciaProd ? avisos : problemas).push({ archivo: nombre, ...f });
    }
  }
  return { problemas, avisos, miradas };
}
