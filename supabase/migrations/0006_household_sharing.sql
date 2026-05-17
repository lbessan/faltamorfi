-- ============================================================================
-- Falta Morfi — Fase 5 (hogar compartido + roles + invitaciones)
--
-- Pegá todo en el SQL Editor y ejecutá. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Agregar 'viewer' al check de role
-- ----------------------------------------------------------------------------
-- Postgres no permite ALTER CHECK directo; hay que dropear y recrear.

alter table public.household_members
  drop constraint if exists household_members_role_check;

alter table public.household_members
  add constraint household_members_role_check
  check (role in ('owner', 'member', 'viewer'));

-- ----------------------------------------------------------------------------
-- 2) Tabla household_invitations
-- ----------------------------------------------------------------------------

create table if not exists public.household_invitations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  -- token largo aleatorio (URL-safe)
  token         text not null unique,
  -- código corto para tipear (8 chars sin ambigüedad)
  code          text not null unique,
  role          text not null default 'member' check (role in ('member', 'viewer')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours'),
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users(id) on delete set null
);

create index if not exists household_invitations_household_idx
  on public.household_invitations(household_id);
create index if not exists household_invitations_token_idx
  on public.household_invitations(token);
create index if not exists household_invitations_code_idx
  on public.household_invitations(code);

-- ----------------------------------------------------------------------------
-- 3) Helpers SQL para chequear permisos
-- ----------------------------------------------------------------------------

create or replace function public.get_household_role(target_household_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.household_members
  where household_id = target_household_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_household_editor(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role in ('owner', 'member')
  );
$$;

-- ----------------------------------------------------------------------------
-- 4) RLS actualizadas: viewer solo lee
-- ----------------------------------------------------------------------------

-- households: read si soy miembro; update solo owner
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

drop policy if exists households_delete on public.households;
create policy households_delete on public.households
  for delete to authenticated
  using (public.is_household_owner(id));

-- household_members: cada uno ve sus vínculos. Owner gestiona miembros.
drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists household_members_insert on public.household_members;
create policy household_members_insert on public.household_members
  for insert to authenticated
  -- Insert ok si soy owner del hogar, O si es el primer miembro al crear hogar
  -- (este caso lo cubre la función handle_new_user con SECURITY DEFINER),
  -- O si es el propio user uniéndose por invitación válida (acceptInvitation
  -- corre con SECURITY DEFINER también).
  with check (public.is_household_owner(household_id));

drop policy if exists household_members_update on public.household_members;
create policy household_members_update on public.household_members
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
  for delete to authenticated
  using (
    -- Owner puede quitar a otros, o cada user puede quitarse a sí mismo
    public.is_household_owner(household_id) or user_id = auth.uid()
  );

-- locations: read miembros, write editor
drop policy if exists locations_all on public.locations;
drop policy if exists locations_select on public.locations;
drop policy if exists locations_write on public.locations;

create policy locations_select on public.locations
  for select to authenticated
  using (public.is_household_member(household_id));

create policy locations_write on public.locations
  for all to authenticated
  using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

-- products
drop policy if exists products_all on public.products;
drop policy if exists products_select on public.products;
drop policy if exists products_write on public.products;

create policy products_select on public.products
  for select to authenticated
  using (public.is_household_member(household_id));

create policy products_write on public.products
  for all to authenticated
  using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

-- stock_items
drop policy if exists stock_items_all on public.stock_items;
drop policy if exists stock_items_select on public.stock_items;
drop policy if exists stock_items_write on public.stock_items;

create policy stock_items_select on public.stock_items
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_member(p.household_id)
    )
  );

create policy stock_items_write on public.stock_items
  for all to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_editor(p.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_household_editor(p.household_id)
    )
  );

-- consumption_log: read miembros, insert editor
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
        and public.is_household_editor(p.household_id)
    )
  );

-- shopping_list_items
drop policy if exists shopping_list_items_all on public.shopping_list_items;
drop policy if exists shopping_list_items_select on public.shopping_list_items;
drop policy if exists shopping_list_items_write on public.shopping_list_items;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.is_household_member(household_id));

create policy shopping_list_items_write on public.shopping_list_items
  for all to authenticated
  using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

-- ----------------------------------------------------------------------------
-- 5) RLS para household_invitations
-- ----------------------------------------------------------------------------

alter table public.household_invitations enable row level security;

-- Solo owner del hogar puede ver/crear/borrar invitaciones.
-- accept_invitation se hace via función SECURITY DEFINER, no INSERT directo.
drop policy if exists household_invitations_select on public.household_invitations;
create policy household_invitations_select on public.household_invitations
  for select to authenticated
  using (public.is_household_owner(household_id));

drop policy if exists household_invitations_insert on public.household_invitations;
create policy household_invitations_insert on public.household_invitations
  for insert to authenticated
  with check (public.is_household_owner(household_id));

drop policy if exists household_invitations_delete on public.household_invitations;
create policy household_invitations_delete on public.household_invitations
  for delete to authenticated
  using (public.is_household_owner(household_id));

-- ----------------------------------------------------------------------------
-- 6) RPC: aceptar invitación
-- Toma un token o un code y, si es válida, agrega al user actual al hogar.
-- Corre con SECURITY DEFINER para bypassar la RLS del INSERT en members.
-- ----------------------------------------------------------------------------

create or replace function public.accept_household_invitation(
  invitation_lookup text
)
returns table (household_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.household_invitations%rowtype;
  uid  uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado.';
  end if;

  -- Aceptamos por token o por code, case-insensitive
  select * into inv
  from public.household_invitations
  where (token = invitation_lookup or code = upper(invitation_lookup))
    and accepted_at is null
    and expires_at > now()
  limit 1;

  if inv.id is null then
    raise exception 'Invitación inválida, vencida o ya usada.';
  end if;

  -- Si ya soy miembro del hogar, no duplicamos.
  if exists (
    select 1 from public.household_members
    where household_id = inv.household_id and user_id = uid
  ) then
    -- Marcamos la invitación como aceptada igual (para que no quede colgada).
    update public.household_invitations
    set accepted_at = now(), accepted_by = uid
    where id = inv.id;
    return query select inv.household_id, (
      select hm.role from public.household_members hm
      where hm.household_id = inv.household_id and hm.user_id = uid
    );
    return;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, uid, inv.role);

  update public.household_invitations
  set accepted_at = now(), accepted_by = uid
  where id = inv.id;

  return query select inv.household_id, inv.role;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Realtime: publicar tablas que queremos sincronizar entre miembros
-- ----------------------------------------------------------------------------
-- Si la publicación no existe (instalación rara), no hacer nada.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.products;
    alter publication supabase_realtime add table public.stock_items;
    alter publication supabase_realtime add table public.shopping_list_items;
  end if;
exception when duplicate_object then
  -- La tabla ya estaba en la publicación, ignorar.
  null;
end $$;
