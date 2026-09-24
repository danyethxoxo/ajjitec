-- AJJITEC: autenticación, perfiles, roles y módulos administrativos.
-- Este archivo mantiene el esquema reproducible del proyecto.

create extension if not exists pgcrypto;

-- Perfil de aplicación asociado a cada usuario de Supabase Auth.
-- Los nuevos registros empiezan como pending y deben ser promovidos por un administrador.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  company text,
  phone text,
  role text not null default 'pending'
    check (role in ('pending', 'admin', 'sales', 'inventory', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert on table public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own_pending" on public.profiles;
create policy "profiles_insert_own_pending"
  on public.profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    and role = 'pending'
    and active = true
  );

-- Helper usado por las políticas de los módulos. Lee solamente el perfil
-- del usuario autenticado y no confía en user_metadata, que el usuario puede editar.
create or replace function public.has_any_role(allowed_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles
    where public.profiles.id = (select auth.uid())
      and public.profiles.active = true
      and public.profiles.role = any(allowed_roles)
  );
$function$;

revoke all on function public.has_any_role(text[]) from public;
grant execute on function public.has_any_role(text[]) to authenticated;

-- Inventario. user_id conserva quién creó el registro; los roles autorizados
-- pueden consultar el inventario compartido de la empresa.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  stock integer not null default 0 check (stock >= 0),
  price numeric(12,2) check (price is null or price >= 0),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

revoke all on table public.inventory_items from anon, authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;

drop policy if exists "inventory_select_staff" on public.inventory_items;
create policy "inventory_select_staff"
  on public.inventory_items
  for select
  to authenticated
  using (public.has_any_role(array['admin', 'inventory', 'viewer']));

drop policy if exists "inventory_insert_staff" on public.inventory_items;
create policy "inventory_insert_staff"
  on public.inventory_items
  for insert
  to authenticated
  with check (
    public.has_any_role(array['admin', 'inventory'])
    and user_id = (select auth.uid())
  );

drop policy if exists "inventory_update_staff" on public.inventory_items;
create policy "inventory_update_staff"
  on public.inventory_items
  for update
  to authenticated
  using (public.has_any_role(array['admin', 'inventory']))
  with check (public.has_any_role(array['admin', 'inventory']));

drop policy if exists "inventory_delete_staff" on public.inventory_items;
create policy "inventory_delete_staff"
  on public.inventory_items
  for delete
  to authenticated
  using (public.has_any_role(array['admin', 'inventory']));

create index if not exists inventory_items_user_id_idx on public.inventory_items(user_id);

-- Clientes. El acceso de escritura queda reservado a administración y ventas.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null,
  contact_name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

revoke all on table public.clients from anon, authenticated;
grant select, insert, update, delete on table public.clients to authenticated;

drop policy if exists "clients_select_staff" on public.clients;
create policy "clients_select_staff"
  on public.clients
  for select
  to authenticated
  using (public.has_any_role(array['admin', 'sales', 'viewer']));

drop policy if exists "clients_insert_staff" on public.clients;
create policy "clients_insert_staff"
  on public.clients
  for insert
  to authenticated
  with check (
    public.has_any_role(array['admin', 'sales'])
    and user_id = (select auth.uid())
  );

drop policy if exists "clients_update_staff" on public.clients;
create policy "clients_update_staff"
  on public.clients
  for update
  to authenticated
  using (public.has_any_role(array['admin', 'sales']))
  with check (public.has_any_role(array['admin', 'sales']));

drop policy if exists "clients_delete_staff" on public.clients;
create policy "clients_delete_staff"
  on public.clients
  for delete
  to authenticated
  using (public.has_any_role(array['admin', 'sales']));

create index if not exists clients_user_id_idx on public.clients(user_id);
