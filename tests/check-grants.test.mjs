/**
 * La guardia de los permisos de las tablas nuevas de `public`: desde el 2026-10-30 Supabase no les
 * da permisos solos. Se prueba la lógica pura sobre migraciones de juguete, que la 0011 da los
 * permisos de lo que ya existe sin abrir lo nuevo, y que el repo de hoy pasa.
 *
 * Correr: `npm test` (node --test; el repo no tiene otro runner).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  faltanGrants,
  grantsEnPublic,
  objetosCreadosEnPublic,
  revisarMigraciones,
  sinComentarios,
} from "../scripts/lib/grants-migracion.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

describe("lo que una migración crea en public", () => {
  it("tablas y vistas, con o sin schema y con «if not exists»; lo temporal y lo de otros schemas, no", () => {
    const sql = `
      create table if not exists public.avisos (id uuid primary key);
      create table "public"."Notas" (id int);
      create table sueltas (id int);
      create or replace view public.resumen as select 1;
      create materialized view public.totales as select 1;
      create temp table borrador (x int);
      create table auth.otra (id int);
      -- create table public.comentada (id int);
    `;
    assert.deepEqual(
      objetosCreadosEnPublic(sql).map((o) => `${o.tipo} ${o.nombre}`),
      ["table avisos", "table notas", "table sueltas", "view resumen", "materialized view totales"],
    );
  });

  it("los grants: por tabla, varias juntas, «on all tables in schema public»; los de secuencias y funciones no cuentan", () => {
    const { porTabla, todas } = grantsEnPublic(`
      grant select, insert, update, delete on public.a, public.b to authenticated, service_role;
      grant select on table public.c to service_role;
      grant usage, select on sequence public.a_id_seq to authenticated;
      grant execute on function public.f() to authenticated;
      grant select on all tables in schema public to anon;
    `);
    assert.deepEqual([...porTabla.get("a")].sort(), ["authenticated", "service_role"]);
    assert.deepEqual([...porTabla.get("b")].sort(), ["authenticated", "service_role"]);
    assert.deepEqual([...porTabla.get("c")], ["service_role"]);
    assert.equal(porTabla.has("a_id_seq"), false);
    assert.deepEqual([...todas], ["anon"]);
  });
});

describe("lo que le falta a cada tabla nueva", () => {
  it("sin grants, le faltan los dos roles; con los dos, nada", () => {
    assert.deepEqual(faltanGrants("create table public.x (id int);"), [
      { nombre: "x", tipo: "table", faltan: ["authenticated", "service_role"] },
    ]);
    assert.deepEqual(
      faltanGrants("create table public.x (id int);\ngrant select, insert on public.x to authenticated, service_role;"),
      [],
    );
  });

  it("con uno solo, falta el otro; «on all tables in schema public» y «to public» cuentan", () => {
    assert.deepEqual(faltanGrants("create table public.x (id int); grant all on public.x to service_role;"), [
      { nombre: "x", tipo: "table", faltan: ["authenticated"] },
    ]);
    assert.deepEqual(
      faltanGrants(
        "create table public.x (id int); grant all on all tables in schema public to authenticated, service_role;",
      ),
      [],
    );
    assert.deepEqual(faltanGrants("create table public.x (id int); grant select on public.x to public;"), []);
  });

  it("una vista nueva también lleva sus grants", () => {
    assert.deepEqual(faltanGrants("create view public.resumen as select 1;"), [
      { nombre: "resumen", tipo: "view", faltan: ["authenticated", "service_role"] },
    ]);
  });

  it("la que sólo usa el servidor, con service_role le alcanza", () => {
    const sql = "create table public.log_x (id int); grant all on public.log_x to service_role;";
    assert.deepEqual(faltanGrants(sql, new Set(["log_x"])), []);
    assert.deepEqual(faltanGrants("create table public.log_x (id int);", new Set(["log_x"])), [
      { nombre: "log_x", tipo: "table", faltan: ["service_role"] },
    ]);
  });

  it("lo comentado no cuenta como grant", () => {
    const sql = "create table public.x (id int);\n-- grant all on public.x to authenticated, service_role;";
    assert.equal(faltanGrants(sql).length, 1);
  });
});

describe("qué migraciones mira y cuándo frena", () => {
  const sinGrant = "create table public.x (id int);";
  const conGrant = `${sinGrant}\ngrant select, insert, update, delete on public.x to authenticated, service_role;`;
  const opciones = { desde: 11, pendientesDeProd: new Set(["0009_pendiente.sql"]) };

  it("las de antes de la 0011 no las mira, salvo las que todavía no están en PROD", () => {
    const r = revisarMigraciones(
      [
        { nombre: "0005_vieja.sql", sql: sinGrant },
        { nombre: "0009_pendiente.sql", sql: conGrant },
        { nombre: "0012_nueva.sql", sql: conGrant },
      ],
      opciones,
    );
    assert.deepEqual(r, { problemas: [], avisos: [], miradas: 2 });
  });

  it("una de la 0011 en adelante sin grant frena siempre", () => {
    const r = revisarMigraciones([{ nombre: "0012_nueva.sql", sql: sinGrant }], opciones);
    assert.deepEqual(
      r.problemas.map((p) => p.archivo),
      ["0012_nueva.sql"],
    );
    assert.deepEqual(r.avisos, []);
  });

  it("una pendiente de PROD sin grant: avisa, y en el PR a main frena", () => {
    const migraciones = [{ nombre: "0009_pendiente.sql", sql: sinGrant }];
    const fuera = revisarMigraciones(migraciones, opciones);
    assert.deepEqual(fuera.problemas, []);
    assert.deepEqual(fuera.avisos, [
      { archivo: "0009_pendiente.sql", nombre: "x", tipo: "table", faltan: ["authenticated", "service_role"] },
    ]);
    const haciaMain = revisarMigraciones(migraciones, { ...opciones, haciaProd: true });
    assert.deepEqual(
      haciaMain.problemas.map((p) => p.archivo),
      ["0009_pendiente.sql"],
    );
    assert.deepEqual(haciaMain.avisos, []);
  });
});

describe("la 0011, la de los permisos de lo que ya existe", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0011_grants_explicitos.sql", import.meta.url), "utf8");

  it("da las tablas de public a authenticated y service_role, y nada a anon", () => {
    const { todas, porTabla } = grantsEnPublic(sql);
    assert.deepEqual([...todas].sort(), ["authenticated", "service_role"]);
    assert.equal(porTabla.size, 0);
  });

  it("no fija permisos por defecto: lo nuevo no queda expuesto solo", () => {
    assert.doesNotMatch(sinComentarios(sql), /\balter\s+default\s+privileges\b/i);
  });
});

describe("el repo de hoy", () => {
  it("pasa la guardia", () => {
    // Como en local: sin la rama de destino de un PR.
    const env = { ...process.env };
    delete env.GITHUB_BASE_REF;
    const r = spawnSync(process.execPath, ["scripts/check-grants.mjs"], { cwd: RAIZ, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^check-grants: limpio/);
  });
});
