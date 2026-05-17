-- ============================================================================
-- Falta Morfi — Fase 3.5 (refactor: producto = tipo, marca/codigo/foto al lote)
--
-- Cambia la semantica del catalogo:
--   ANTES: 1 producto = 1 SKU especifico ("Leche La Serenisima 1L").
--   AHORA: 1 producto = 1 tipo generico ("Leche"), y cada compra (stock_item)
--          guarda la marca, el codigo de barras y la imagen.
--
-- Pegá todo este archivo en el SQL Editor de Supabase y ejecutá.
-- Es idempotente: si ya corrió, las columnas existen y no se vuelve a aplicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nuevas columnas en stock_items
-- ----------------------------------------------------------------------------

alter table public.stock_items
  add column if not exists brand      text,
  add column if not exists barcode    text,
  add column if not exists image_url  text;

create index if not exists stock_items_barcode_idx
  on public.stock_items(barcode)
  where barcode is not null;

-- ----------------------------------------------------------------------------
-- 2) Migrar datos: pasar brand/barcode/image_url del producto a su lote
-- ----------------------------------------------------------------------------
-- Si un producto tiene 1+ lotes, copiamos al primer lote (más antiguo).
-- Si un producto NO tiene lotes (por ejemplo, fue migrado en 0002 con
-- quantity=0 y no tuvo stock_item), creamos un lote vacio para preservar
-- la info (quantity=0, sin vto).

with first_lots as (
  select distinct on (product_id)
    id as lot_id,
    product_id
  from public.stock_items
  order by product_id, created_at asc
),
products_with_lot as (
  select
    p.id            as product_id,
    p.brand,
    p.barcode,
    p.image_url,
    fl.lot_id
  from public.products p
  left join first_lots fl on fl.product_id = p.id
  where p.brand is not null
     or p.barcode is not null
     or p.image_url is not null
)
update public.stock_items s
set
  brand     = coalesce(s.brand,     pwl.brand),
  barcode   = coalesce(s.barcode,   pwl.barcode),
  image_url = coalesce(s.image_url, pwl.image_url)
from products_with_lot pwl
where s.id = pwl.lot_id;

-- Para productos sin lote pero con datos: creamos un lote vacio para no perder
-- la informacion.
insert into public.stock_items (product_id, location_id, quantity, brand, barcode, image_url)
select
  p.id,
  p.default_location_id,
  0,
  p.brand,
  p.barcode,
  p.image_url
from public.products p
where (p.brand is not null or p.barcode is not null or p.image_url is not null)
  and not exists (
    select 1 from public.stock_items s where s.product_id = p.id
  );

-- ----------------------------------------------------------------------------
-- 3) Drop unique constraint viejo: products.(household_id, barcode)
-- ----------------------------------------------------------------------------
-- En el nuevo modelo, lotes del mismo SKU pueden repetir barcode. No es id.

drop index if exists public.products_household_barcode_unique;

-- ----------------------------------------------------------------------------
-- 4) Drop columnas viejas en products
-- ----------------------------------------------------------------------------
-- Hacemos un pequeno checkpoint: las dropeamos solo si los datos ya fueron
-- migrados (la migración del paso 2 corrió). Como es un IF EXISTS DROP COLUMN,
-- es safe llamar dos veces.

alter table public.products
  drop column if exists brand,
  drop column if exists barcode,
  drop column if exists image_url;
