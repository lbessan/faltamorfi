-- ============================================================================
-- Falta Morfi - Schema Fase 1 (core inventario)
--
-- Pegá todo este archivo en el SQL Editor de Supabase y ejecutá.
-- Es idempotente: usar 'create ... if not exists' donde se puede.
-- Las políticas RLS sí se recrean (drop + create) por si las cambiamos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensiones
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()


-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx
  on public.household_members(user_id);

create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  icon         text,                      -- hint visual opcional (despues lo mapeamos a Lucide)
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists locations_household_id_idx
  on public.locations(household_id);

create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  name                 text not null,
  brand                text,
  category             text,
  unit                 text not null default 'un',  -- un, kg, g, l, ml, paq, ...
  quantity             numeric not null default 0,  -- cantidad actual
  low_stock_threshold  numeric not null default 1,
  default_location_id  uuid references public.locations(id) on delete set null,
  barcode              text,
  image_url            text,
  notes                text,
  metadata             jsonb not null default '{}'::jsonb, -- placeholder para datos de Open Food Facts / IA
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists products_household_id_idx
  on public.products(household_id);

create index if not exists products_default_location_id_idx
  on public.products(default_location_id);

-- Un barcode no puede repetirse dentro del mismo hogar (pero sí entre hogares).
create unique index if not exists products_household_barcode_unique
  on public.products(household_id, barcode)
  where barcode is not null;

create table if not exists public.consumption_log (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  quantity    numeric not null,                                 -- positivo = consumo, negativo = devolución/ajuste
  occurred_at timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  note        text
);

create index if not exists consumption_log_product_id_idx
  on public.consumption_log(product_id);

create index if not exists consumption_log_occurred_at_idx
  on public.consumption_log(occurred_at desc);


-- ----------------------------------------------------------------------------
-- Trigger: actualizar updated_at en products
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- Onboarding: crear hogar + ubicaciones default cuando se registra un usuario
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

  insert into public.locations (household_id, name, icon, sort_order) values
    (new_household_id, 'Alacena',  'cabinet',      0),
    (new_household_id, 'Heladera', 'refrigerator', 1),
    (new_household_id, 'Freezer',  'snowflake',    2),
    (new_household_id, 'Botiquín', 'pill',         3);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- Helper: chequear si un usuario es miembro de un hogar
-- (evita recursion en policies de household_members)
-- ----------------------------------------------------------------------------
create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;


-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.locations         enable row level security;
alter table public.products          enable row level security;
alter table public.consumption_log   enable row level security;

-- households: ver/editar solo si soy miembro
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- household_members: ver solo mis vínculos
drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

-- locations
drop policy if exists locations_all on public.locations;
create policy locations_all on public.locations
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- products
drop policy if exists products_all on public.products;
create policy products_all on public.products
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- consumption_log: ver/insertar si el producto pertenece a mi hogar
drop policy if exists consumption_log_select on public.consumption_log;
create policy consumption_log_select on public.consumption_log
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_member(p.household_id)
    )
  );

drop policy if exists consumption_log_insert on public.consumption_log;
create policy consumption_log_insert on public.consumption_log
  for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_member(p.household_id)
    )
  );


-- ----------------------------------------------------------------------------
-- Realtime (opcional para Fase 5 — lo dejo declarado pero comentado)
-- ----------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.products;
-- alter publication supabase_realtime add table public.consumption_log;
