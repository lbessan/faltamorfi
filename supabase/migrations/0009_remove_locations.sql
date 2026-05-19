-- ============================================================================
-- Falta Morfi — Fase 9 (eliminar el concepto de ubicaciones)
--
-- Reemplazamos "locations" (Alacena / Heladera / Freezer / Botiquín) por dos
-- flags semánticos en cada lote:
--   * frozen_at + frozen_max_days  → está en el freezer
--   * opened_at + opened_max_days  → está abierto en la heladera
--
-- Saber si algo está en "alacena" o "botiquín" no agregaba valor real, y forzaba
-- a mantener una entidad extra. Los items se muestran en una sola lista, con
-- iconos visuales según el flag.
--
-- Idempotente: corre múltiples veces sin error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Drop de columnas que apuntan a locations
-- ----------------------------------------------------------------------------

drop index if exists public.products_default_location_id_idx;
drop index if exists public.stock_items_location_id_idx;

alter table public.products
  drop column if exists default_location_id;

alter table public.stock_items
  drop column if exists location_id;


-- ----------------------------------------------------------------------------
-- 2) Drop de la tabla locations
-- ----------------------------------------------------------------------------

drop policy if exists locations_all on public.locations;
drop index if exists public.locations_household_id_idx;
drop table if exists public.locations;


-- ----------------------------------------------------------------------------
-- 3) handle_new_user: sin sembrado de locations
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  display_name     text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'mi hogar'
  );

  insert into public.households (name)
  values ('Casa de ' || display_name)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  -- Sembrado del catálogo curado (Fase 3.7).
  perform public.seed_catalog_for_household(new_household_id);

  return new;
end;
$$;
