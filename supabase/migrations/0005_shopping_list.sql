-- ============================================================================
-- Falta Morfi — Fase 4 (lista de compras + modo super + cierre de viaje)
--
-- Pegá todo en el SQL Editor y ejecutá. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabla shopping_list_items
-- ----------------------------------------------------------------------------

create table if not exists public.shopping_list_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  -- product_id es NULLABLE: permite items custom que no están en el catálogo
  -- (ej. "traer pilas de mi viejo"). En ese caso, custom_name debe estar seteado.
  product_id     uuid references public.products(id) on delete set null,
  custom_name    text,
  quantity       numeric not null default 1 check (quantity > 0),
  unit           text not null default 'un',
  notes          text,
  state          text not null default 'pending'
                 check (state in ('pending', 'checked', 'completed', 'discarded')),
  source         text not null default 'manual'
                 check (source in ('manual', 'restock', 'low_stock')),
  added_at       timestamptz not null default now(),
  added_by       uuid references auth.users(id) on delete set null,
  checked_at     timestamptz,
  completed_at   timestamptz,
  -- Al menos uno: product_id o custom_name.
  constraint shopping_list_items_has_product_or_name
    check (product_id is not null or (custom_name is not null and length(custom_name) > 0))
);

create index if not exists shopping_list_items_household_idx
  on public.shopping_list_items(household_id, state);

create index if not exists shopping_list_items_product_idx
  on public.shopping_list_items(product_id) where product_id is not null;

create index if not exists shopping_list_items_state_idx
  on public.shopping_list_items(household_id, state, added_at desc);

-- ----------------------------------------------------------------------------
-- 2) RLS
-- ----------------------------------------------------------------------------

alter table public.shopping_list_items enable row level security;

drop policy if exists shopping_list_items_all on public.shopping_list_items;
create policy shopping_list_items_all on public.shopping_list_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ----------------------------------------------------------------------------
-- 3) RPC: cerrar viaje — convierte los items 'checked' en lotes nuevos.
--
-- Para cada item checked con product_id, crea un stock_item con la cantidad
-- indicada, ubicación = default_location del producto, sin vto (el usuario
-- puede editarlo después).
-- Items custom (sin product_id) se descartan en este flujo — no podemos
-- crear un lote de un tipo que no existe. La UI los mostrará para que el
-- usuario decida si quiere crear el tipo o eliminarlos.
--
-- Marca todos los items procesados como 'completed' con completed_at = now().
-- Devuelve el conteo de items procesados.
-- ----------------------------------------------------------------------------

create or replace function public.close_shopping_trip(target_household_id uuid)
returns int
language plpgsql
security invoker
as $$
declare
  processed_count int := 0;
  rec record;
begin
  for rec in
    select s.id, s.product_id, s.quantity, s.unit, s.notes,
           p.default_location_id, p.unit as product_unit
    from public.shopping_list_items s
    join public.products p on p.id = s.product_id
    where s.household_id = target_household_id
      and s.state = 'checked'
      and s.product_id is not null
    for update
  loop
    insert into public.stock_items (product_id, location_id, quantity, notes)
    values (
      rec.product_id,
      rec.default_location_id,
      rec.quantity,
      rec.notes
    );

    update public.shopping_list_items
    set state = 'completed',
        completed_at = now()
    where id = rec.id;

    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;
