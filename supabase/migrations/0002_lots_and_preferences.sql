-- ============================================================================
-- Falta Morfi - Fase 3 (vencimientos, lotes, preferencias de notificación)
--
-- Pegá este archivo entero en el SQL Editor de Supabase y ejecutá. Es idempotente:
--   - usa `if not exists` y `if exists` donde corresponde
--   - drop+create policies (siempre limpio)
--
-- Cambios principales:
--   * Nueva tabla `stock_items` (lotes con cantidad + vencimiento + freezer).
--   * Nueva columna `locations.kind` para distinguir freezer/heladera/etc.
--   * Nueva tabla `user_preferences` (días de aviso + push subscription).
--   * Triggers que mantienen `products.quantity` como suma de los lotes.
--   * Migración suave: para cada producto con quantity > 0, crea un lote inicial.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- locations: agregar `kind` y backfill por nombre default
-- ----------------------------------------------------------------------------

alter table public.locations
  add column if not exists kind text not null default 'general'
    check (kind in ('general', 'pantry', 'fridge', 'freezer', 'medicine', 'cleaning', 'other'));

-- Backfill por nombre para las ubicaciones creadas en Fase 0/1.
update public.locations set kind = 'pantry'   where lower(name) like '%alacena%' and kind = 'general';
update public.locations set kind = 'fridge'   where lower(name) like '%heladera%' and kind = 'general';
update public.locations set kind = 'freezer'  where lower(name) like '%freezer%'  and kind = 'general';
update public.locations set kind = 'freezer'  where lower(name) like '%congel%'   and kind = 'general';
update public.locations set kind = 'medicine' where lower(name) like '%botiqu%'   and kind = 'general';


-- ----------------------------------------------------------------------------
-- stock_items: lotes
-- ----------------------------------------------------------------------------

create table if not exists public.stock_items (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  location_id        uuid references public.locations(id) on delete set null,
  quantity           numeric not null check (quantity >= 0),
  expires_on         date,
  frozen_at          timestamptz,           -- cuándo se congeló (si aplica)
  frozen_max_days    int check (frozen_max_days is null or frozen_max_days > 0),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists stock_items_product_id_idx     on public.stock_items(product_id);
create index if not exists stock_items_location_id_idx    on public.stock_items(location_id);
create index if not exists stock_items_expires_on_idx     on public.stock_items(expires_on) where expires_on is not null;
-- Vista de FIFO: primero NULL al final (sin vencimiento), después por fecha asc.
create index if not exists stock_items_fifo_idx on public.stock_items(product_id, expires_on nulls last, created_at);

drop trigger if exists stock_items_set_updated_at on public.stock_items;
create trigger stock_items_set_updated_at
  before update on public.stock_items
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- user_preferences: configuración por usuario (notificaciones, alertas)
-- ----------------------------------------------------------------------------

create table if not exists public.user_preferences (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  default_expiry_warning_days   int  not null default 3 check (default_expiry_warning_days >= 0 and default_expiry_warning_days <= 60),
  notifications_enabled         bool not null default false,
  push_subscription             jsonb,
  updated_at                    timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- Sync products.quantity = SUM(stock_items.quantity)
-- ----------------------------------------------------------------------------

create or replace function public.sync_product_quantity()
returns trigger
language plpgsql
as $$
declare
  affected_product_id uuid;
begin
  affected_product_id := coalesce(NEW.product_id, OLD.product_id);
  if affected_product_id is null then
    return coalesce(NEW, OLD);
  end if;

  update public.products
  set quantity = coalesce((
    select sum(quantity)::numeric
    from public.stock_items
    where product_id = affected_product_id
  ), 0)
  where id = affected_product_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists stock_items_sync_quantity_ins on public.stock_items;
create trigger stock_items_sync_quantity_ins
  after insert on public.stock_items
  for each row execute function public.sync_product_quantity();

drop trigger if exists stock_items_sync_quantity_upd on public.stock_items;
create trigger stock_items_sync_quantity_upd
  after update of quantity, product_id on public.stock_items
  for each row execute function public.sync_product_quantity();

drop trigger if exists stock_items_sync_quantity_del on public.stock_items;
create trigger stock_items_sync_quantity_del
  after delete on public.stock_items
  for each row execute function public.sync_product_quantity();


-- ----------------------------------------------------------------------------
-- Migración suave: para cada producto existente con stock > 0, crear un lote
-- inicial con esa cantidad. Se ejecuta una sola vez (idempotente por la guard).
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.stock_items limit 1) then
    insert into public.stock_items (product_id, location_id, quantity)
    select p.id, p.default_location_id, p.quantity
    from public.products p
    where p.quantity > 0;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.stock_items      enable row level security;
alter table public.user_preferences enable row level security;

-- stock_items: acceso si el producto pertenece a un hogar del usuario
drop policy if exists stock_items_all on public.stock_items;
create policy stock_items_all on public.stock_items
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_member(p.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_member(p.household_id)
    )
  );

-- user_preferences: cada usuario maneja solo lo suyo
drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_preferences_upsert on public.user_preferences;
create policy user_preferences_upsert on public.user_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_preferences_update on public.user_preferences;
create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ----------------------------------------------------------------------------
-- Función RPC: descontar stock siguiendo FIFO (lotes con vto más próximo primero).
-- Devuelve el total efectivamente descontado.
-- ----------------------------------------------------------------------------

create or replace function public.consume_from_lots(
  target_product_id uuid,
  amount numeric
)
returns numeric
language plpgsql
security invoker
as $$
declare
  remaining numeric := amount;
  rec record;
  take numeric;
begin
  if amount is null or amount <= 0 then
    return 0;
  end if;

  for rec in
    select id, quantity from public.stock_items
    where product_id = target_product_id and quantity > 0
    order by expires_on nulls last, created_at
    for update
  loop
    exit when remaining <= 0;
    take := least(rec.quantity, remaining);
    update public.stock_items
      set quantity = quantity - take
      where id = rec.id;
    remaining := remaining - take;
  end loop;

  -- Limpieza opcional: borrar lotes que quedaron en 0 hace rato. Lo dejamos
  -- comentado por ahora — mantenerlos sirve para histórico.
  -- delete from public.stock_items where product_id = target_product_id and quantity = 0;

  return amount - remaining;
end;
$$;
