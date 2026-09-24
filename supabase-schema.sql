-- AJJITEC: autenticación, perfiles, roles y módulos administrativos.
-- Este archivo mantiene el esquema reproducible del proyecto.

create extension if not exists pgcrypto;
create schema if not exists private;

-- Perfil de aplicación asociado a cada usuario de Supabase Auth.
-- Los nuevos registros empiezan como pending y deben ser promovidos por un administrador.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  company text,
  phone text,
  role text not null default 'pending'
    check (role in ('pending', 'admin', 'sales', 'inventory', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert on table public.profiles to authenticated;

create index if not exists profiles_role_active_idx on public.profiles(role, active);
create index if not exists profiles_email_idx on public.profiles(email);

-- Helper privado para políticas que necesitan consultar el perfil sin recursión RLS.
-- Solo devuelve un booleano para el usuario actual y valida auth.uid() explícitamente.
create or replace function private.has_any_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where public.profiles.id = (select auth.uid())
        and public.profiles.active = true
        and public.profiles.role = any(allowed_roles)
    );
$function$;

revoke all on function private.has_any_role(text[]) from public, anon, service_role;
grant execute on function private.has_any_role(text[]) to authenticated;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or (select private.has_any_role(array['admin']))
  );

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

grant update on table public.profiles to authenticated;

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using ((select private.has_any_role(array['admin'])))
  with check ((select private.has_any_role(array['admin'])));

-- Helper invoker usado por las políticas de los módulos. El usuario solo puede
-- consultar su propio perfil por RLS, por lo que no expone datos de otros usuarios.
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

-- Protege los cambios de acceso sin exponer una función SECURITY DEFINER al API.
create or replace function private.protect_profile_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  active_admin_count integer;
begin
  if new.role is null
     or new.role not in ('pending', 'admin', 'sales', 'inventory', 'viewer')
     or new.active is null then
    raise exception 'invalid_profile_access';
  end if;

  if old.id = (select auth.uid())
     and old.role = 'admin'
     and old.active = true
     and (new.role <> 'admin' or new.active = false) then
    raise exception 'cannot_remove_current_admin';
  end if;

  if old.role = 'admin'
     and old.active = true
     and (new.role <> 'admin' or new.active = false) then
    select count(*)
    into active_admin_count
    from public.profiles
    where public.profiles.role = 'admin'
      and public.profiles.active = true
      and public.profiles.id <> old.id;

    if active_admin_count = 0 then
      raise exception 'cannot_remove_last_admin';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function private.protect_profile_access() from public, anon, authenticated, service_role;

drop trigger if exists protect_profile_access on public.profiles;
create trigger protect_profile_access
  before update on public.profiles
  for each row execute function private.protect_profile_access();

drop function if exists public.set_profile_access(uuid, text, boolean);

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

-- Campos de seguimiento comercial para preparar clientes y cotizaciones.
alter table public.clients add column if not exists status text not null default 'lead';
alter table public.clients add column if not exists industry text;
alter table public.clients add column if not exists website text;
alter table public.clients add column if not exists tax_id text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.clients add column if not exists last_contact_at timestamptz;
alter table public.clients add column if not exists updated_at timestamptz not null default now();

alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients add constraint clients_status_check
  check (status in ('lead', 'active', 'inactive'));

create index if not exists clients_status_updated_at_idx
  on public.clients(status, updated_at desc);
create index if not exists clients_assigned_to_idx on public.clients(assigned_to);
create index if not exists clients_last_contact_at_idx on public.clients(last_contact_at desc);

create or replace function private.touch_client_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function private.touch_client_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists touch_client_updated_at on public.clients;
create trigger touch_client_updated_at
  before update on public.clients
  for each row execute function private.touch_client_updated_at();

-- Cotizaciones con partidas y totales calculados en la base de datos.
create sequence if not exists public.quote_number_seq;
grant usage on sequence public.quote_number_seq to authenticated;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint not null default nextval('public.quote_number_seq') unique,
  client_id uuid references public.clients(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'rejected', 'expired', 'cancelled')),
  currency char(3) not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  valid_until date,
  notes text,
  tax_rate numeric(5,2) not null default 16 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.quote_number_seq owned by public.quotes.quote_number;
alter table public.quotes enable row level security;

revoke all on table public.quotes from anon, authenticated;
grant select on table public.quotes to authenticated;
grant insert (client_id, assigned_to, status, currency, valid_until, notes, tax_rate)
  on table public.quotes to authenticated;
grant update (client_id, assigned_to, status, currency, valid_until, notes, tax_rate)
  on table public.quotes to authenticated;
grant delete on table public.quotes to authenticated;

drop policy if exists "quotes_select_staff" on public.quotes;
create policy "quotes_select_staff"
  on public.quotes
  for select
  to authenticated
  using ((select public.has_any_role(array['admin', 'sales', 'viewer'])));

drop policy if exists "quotes_insert_staff" on public.quotes;
create policy "quotes_insert_staff"
  on public.quotes
  for insert
  to authenticated
  with check (
    (select public.has_any_role(array['admin', 'sales']))
    and created_by = (select auth.uid())
  );

drop policy if exists "quotes_update_staff" on public.quotes;
create policy "quotes_update_staff"
  on public.quotes
  for update
  to authenticated
  using ((select public.has_any_role(array['admin', 'sales'])))
  with check ((select public.has_any_role(array['admin', 'sales'])));

drop policy if exists "quotes_delete_staff" on public.quotes;
create policy "quotes_delete_staff"
  on public.quotes
  for delete
  to authenticated
  using ((select public.has_any_role(array['admin', 'sales'])));

create index if not exists quotes_client_id_idx on public.quotes(client_id);
create index if not exists quotes_created_by_idx on public.quotes(created_by);
create index if not exists quotes_assigned_to_idx on public.quotes(assigned_to);
create index if not exists quotes_status_created_at_idx on public.quotes(status, created_at desc);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  line_total numeric(12,2) generated always as (
    round(quantity * unit_price * (1 - discount_percent / 100), 2)
  ) stored,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint quote_items_description_not_blank check (length(trim(description)) > 0)
);

alter table public.quote_items enable row level security;

revoke all on table public.quote_items from anon, authenticated;
grant select on table public.quote_items to authenticated;
grant insert (quote_id, product_id, sku, description, quantity, unit_price, discount_percent, sort_order)
  on table public.quote_items to authenticated;
grant update (product_id, sku, description, quantity, unit_price, discount_percent, sort_order)
  on table public.quote_items to authenticated;
grant delete on table public.quote_items to authenticated;

drop policy if exists "quote_items_select_staff" on public.quote_items;
create policy "quote_items_select_staff"
  on public.quote_items
  for select
  to authenticated
  using (
    (select public.has_any_role(array['admin', 'sales', 'viewer']))
    and exists (select 1 from public.quotes where public.quotes.id = quote_items.quote_id)
  );

drop policy if exists "quote_items_insert_staff" on public.quote_items;
create policy "quote_items_insert_staff"
  on public.quote_items
  for insert
  to authenticated
  with check (
    (select public.has_any_role(array['admin', 'sales']))
    and exists (select 1 from public.quotes where public.quotes.id = quote_items.quote_id)
  );

drop policy if exists "quote_items_update_staff" on public.quote_items;
create policy "quote_items_update_staff"
  on public.quote_items
  for update
  to authenticated
  using (
    (select public.has_any_role(array['admin', 'sales']))
    and exists (select 1 from public.quotes where public.quotes.id = quote_items.quote_id)
  )
  with check (
    (select public.has_any_role(array['admin', 'sales']))
    and exists (select 1 from public.quotes where public.quotes.id = quote_items.quote_id)
  );

drop policy if exists "quote_items_delete_staff" on public.quote_items;
create policy "quote_items_delete_staff"
  on public.quote_items
  for delete
  to authenticated
  using (
    (select public.has_any_role(array['admin', 'sales']))
    and exists (select 1 from public.quotes where public.quotes.id = quote_items.quote_id)
  );

create index if not exists quote_items_quote_id_idx on public.quote_items(quote_id, sort_order);
create index if not exists quote_items_product_id_idx on public.quote_items(product_id);

create or replace function private.touch_quote_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function private.touch_quote_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists touch_quote_updated_at on public.quotes;
create trigger touch_quote_updated_at
  before update on public.quotes
  for each row execute function private.touch_quote_updated_at();

create or replace function private.refresh_quote_totals(target_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  next_subtotal numeric(12,2);
  next_tax numeric(12,2);
  current_tax_rate numeric(5,2);
begin
  if target_quote_id is null then return; end if;

  select quotes.tax_rate
  into current_tax_rate
  from public.quotes
  where quotes.id = target_quote_id;

  if current_tax_rate is null then return; end if;

  select coalesce(sum(quote_items.line_total), 0)::numeric(12,2)
  into next_subtotal
  from public.quote_items
  where quote_items.quote_id = target_quote_id;

  next_tax := round(next_subtotal * current_tax_rate / 100, 2);

  update public.quotes
  set subtotal = next_subtotal,
      tax = next_tax,
      total = next_subtotal + next_tax
  where quotes.id = target_quote_id;
end;
$function$;

revoke all on function private.refresh_quote_totals(uuid) from public, anon, authenticated, service_role;

create or replace function private.refresh_quote_totals_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.refresh_quote_totals(coalesce(new.quote_id, old.quote_id));
  if tg_op = 'UPDATE' and old.quote_id is distinct from new.quote_id then
    perform private.refresh_quote_totals(old.quote_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.refresh_quote_totals_from_item() from public, anon, authenticated, service_role;

drop trigger if exists refresh_quote_totals_from_item on public.quote_items;
create trigger refresh_quote_totals_from_item
  after insert or update or delete on public.quote_items
  for each row execute function private.refresh_quote_totals_from_item();

create or replace function private.refresh_quote_totals_from_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.tax_rate is distinct from old.tax_rate then
    perform private.refresh_quote_totals(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function private.refresh_quote_totals_from_quote() from public, anon, authenticated, service_role;

drop trigger if exists refresh_quote_totals_from_quote on public.quotes;
create trigger refresh_quote_totals_from_quote
  after update of tax_rate on public.quotes
  for each row execute function private.refresh_quote_totals_from_quote();

-- Catalogo de productos. Mantiene separado el inventario operativo legado para
-- poder crecer hacia cotizaciones y una tienda sin romper datos existentes.
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_name_not_blank check (length(trim(name)) > 0),
  constraint product_categories_slug_not_blank check (length(trim(slug)) > 0)
);

alter table public.product_categories enable row level security;

revoke all on table public.product_categories from anon, authenticated;
grant select on table public.product_categories to anon, authenticated;
grant insert, update, delete on table public.product_categories to authenticated;

drop policy if exists "product_categories_public_select" on public.product_categories;
create policy "product_categories_public_select"
  on public.product_categories
  for select
  to anon
  using (active = true);

drop policy if exists "product_categories_staff_select" on public.product_categories;
create policy "product_categories_staff_select"
  on public.product_categories
  for select
  to authenticated
  using (
    active = true
    or (select public.has_any_role(array['admin', 'inventory', 'viewer']))
  );

drop policy if exists "product_categories_insert_staff" on public.product_categories;
create policy "product_categories_insert_staff"
  on public.product_categories
  for insert
  to authenticated
  with check ((select public.has_any_role(array['admin', 'inventory'])));

drop policy if exists "product_categories_update_staff" on public.product_categories;
create policy "product_categories_update_staff"
  on public.product_categories
  for update
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])))
  with check ((select public.has_any_role(array['admin', 'inventory'])));

drop policy if exists "product_categories_delete_staff" on public.product_categories;
create policy "product_categories_delete_staff"
  on public.product_categories
  for delete
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])));

create index if not exists product_categories_active_idx
  on public.product_categories(active, name);

insert into public.product_categories (name, slug)
values
  ('AJJITEC', 'ajjitec'),
  ('Accesorios Huber', 'accesorios-huber'),
  ('Agitadores De Mecanicos', 'agitadores-de-mecanicos'),
  ('Agitadores IKA Process', 'agitadores-ika-process'),
  ('Agitadores Magneticos', 'agitadores-magneticos'),
  ('Agitadores Magneticos Con Multiposicion', 'agitadores-magneticos-con-multiposicion'),
  ('Agitadores Verticales', 'agitadores-verticales'),
  ('Chillers Huber', 'chillers-huber'),
  ('Dispersor En Linea Tres Etapas IKA Process', 'dispersor-en-linea-tres-etapas-ika-process'),
  ('Dispersor En Linea Una Etapa IKA Process', 'dispersor-en-linea-una-etapa-ika-process'),
  ('Dispersor En Lote IKA Process', 'dispersor-en-lote-ika-process'),
  ('Dispersor Fondo De Tanque IKA Process', 'dispersor-fondo-de-tanque-ika-process'),
  ('Dispersores', 'dispersores'),
  ('Huber', 'huber'),
  ('IKA Laboratorio', 'ika-laboratorio'),
  ('IKA Procesos', 'ika-procesos'),
  ('Mezclas Solido Liquido IKA Process', 'mezclas-solido-liquido-ika-process'),
  ('Molinos', 'molinos'),
  ('Molinos Coloidales IKA Process', 'molinos-coloidales-ika-process'),
  ('Plantas De Laboratorio IKA Process', 'plantas-de-laboratorio-ika-process'),
  ('Plantas De Proceso IKA Process', 'plantas-de-proceso-ika-process'),
  ('Plantas Piloto IKA Process', 'plantas-piloto-ika-process'),
  ('Reactores De Alta Viscosidad', 'reactores-de-alta-viscosidad'),
  ('Reactores De Sintesis', 'reactores-de-sintesis'),
  ('Rotavapores', 'rotavapores'),
  ('Software De Laboratorio', 'software-de-laboratorio'),
  ('Stands IKA Process', 'stands-ika-process'),
  ('Termostatos', 'termostatos'),
  ('Termostatos De Inmersion Banos De Circulacion Huber', 'termostatos-de-inmersion-banos-de-circulacion-huber'),
  ('Unimotive Huber', 'unimotive-huber'),
  ('Unistats Huber', 'unistats-huber'),
  ('Viscosimetro', 'viscosimetro')
on conflict (slug) do update
  set name = excluded.name,
      active = true,
      updated_at = now();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete set null,
  sku text not null unique,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  currency char(3) not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_not_blank check (length(trim(sku)) > 0),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_slug_not_blank check (length(trim(slug)) > 0)
);

alter table public.products enable row level security;

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
grant insert (category_id, sku, name, slug, short_description, description, price, currency, stock, active, featured)
  on table public.products to authenticated;
grant update (category_id, sku, name, slug, short_description, description, price, currency, stock, active, featured)
  on table public.products to authenticated;
grant delete on table public.products to authenticated;

drop policy if exists "products_public_select" on public.products;
create policy "products_public_select"
  on public.products
  for select
  to anon
  using (active = true);

drop policy if exists "products_staff_select" on public.products;
create policy "products_staff_select"
  on public.products
  for select
  to authenticated
  using (
    active = true
    or (select public.has_any_role(array['admin', 'inventory', 'viewer']))
  );

drop policy if exists "products_insert_staff" on public.products;
create policy "products_insert_staff"
  on public.products
  for insert
  to authenticated
  with check (
    (select public.has_any_role(array['admin', 'inventory']))
    and created_by = (select auth.uid())
  );

drop policy if exists "products_update_staff" on public.products;
create policy "products_update_staff"
  on public.products
  for update
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])))
  with check ((select public.has_any_role(array['admin', 'inventory'])));

drop policy if exists "products_delete_staff" on public.products;
create policy "products_delete_staff"
  on public.products
  for delete
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])));

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_created_by_idx on public.products(created_by);
create index if not exists products_active_featured_idx on public.products(active, featured);
create index if not exists products_created_at_idx on public.products(created_at desc);

create or replace function private.touch_product_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function private.touch_product_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists touch_product_updated_at on public.products;
create trigger touch_product_updated_at
  before update on public.products
  for each row execute function private.touch_product_updated_at();

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_images_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint product_images_unique_path unique (product_id, storage_path)
);

alter table public.product_images enable row level security;

revoke all on table public.product_images from anon, authenticated;
grant select on table public.product_images to anon, authenticated;
grant insert (product_id, storage_path, alt_text, sort_order, is_primary)
  on table public.product_images to authenticated;
grant update (alt_text, sort_order, is_primary) on table public.product_images to authenticated;
grant delete on table public.product_images to authenticated;

drop policy if exists "product_images_public_select" on public.product_images;
create policy "product_images_public_select"
  on public.product_images
  for select
  to anon
  using (
    exists (
      select 1
      from public.products
      where public.products.id = product_images.product_id
        and public.products.active = true
    )
  );

drop policy if exists "product_images_staff_select" on public.product_images;
create policy "product_images_staff_select"
  on public.product_images
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products
      where public.products.id = product_images.product_id
        and public.products.active = true
    )
    or (select public.has_any_role(array['admin', 'inventory', 'viewer']))
  );

drop policy if exists "product_images_insert_staff" on public.product_images;
create policy "product_images_insert_staff"
  on public.product_images
  for insert
  to authenticated
  with check (
    (select public.has_any_role(array['admin', 'inventory']))
    and created_by = (select auth.uid())
    and exists (select 1 from public.products where public.products.id = product_images.product_id)
  );

drop policy if exists "product_images_update_staff" on public.product_images;
create policy "product_images_update_staff"
  on public.product_images
  for update
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])))
  with check ((select public.has_any_role(array['admin', 'inventory'])));

drop policy if exists "product_images_delete_staff" on public.product_images;
create policy "product_images_delete_staff"
  on public.product_images
  for delete
  to authenticated
  using ((select public.has_any_role(array['admin', 'inventory'])));

create index if not exists product_images_product_id_idx on public.product_images(product_id, sort_order);
create index if not exists product_images_created_by_idx on public.product_images(created_by);

-- Las imagenes del catalogo son publicas para que el sitio pueda mostrarlas.
-- Subir, reemplazar y eliminar archivos sigue requiriendo un rol interno.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_storage_public_select" on storage.objects;
create policy "product_images_storage_public_select"
  on storage.objects
  for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "product_images_storage_insert_staff" on storage.objects;
create policy "product_images_storage_insert_staff"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (select public.has_any_role(array['admin', 'inventory']))
  );

drop policy if exists "product_images_storage_update_staff" on storage.objects;
create policy "product_images_storage_update_staff"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select public.has_any_role(array['admin', 'inventory']))
  )
  with check (
    bucket_id = 'product-images'
    and (select public.has_any_role(array['admin', 'inventory']))
  );

drop policy if exists "product_images_storage_delete_staff" on storage.objects;
create policy "product_images_storage_delete_staff"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select public.has_any_role(array['admin', 'inventory']))
  );

-- Vistas operativas para dashboards. security_invoker hace que respeten el RLS
-- de las tablas subyacentes para cada usuario autenticado.
create or replace view public.dashboard_metrics
with (security_invoker = true)
as
select
  (select count(*)::integer from public.products) as products_total,
  (select count(*)::integer from public.products where active = true) as products_active,
  (select coalesce(sum(stock), 0)::bigint from public.products where active = true) as inventory_units,
  (select count(*)::integer from public.clients) as clients_total,
  (select count(*)::integer from public.clients where status = 'lead') as clients_leads,
  (select count(*)::integer from public.quotes) as quotes_total,
  (select count(*)::integer from public.quotes where status = 'approved') as quotes_approved,
  (select coalesce(sum(total), 0)::numeric(14,2) from public.quotes where status in ('sent', 'approved')) as pipeline_total,
  (select coalesce(sum(total), 0)::numeric(14,2) from public.quotes where status = 'approved') as approved_total;

create or replace view public.dashboard_quote_status
with (security_invoker = true)
as
select
  status,
  count(*)::integer as total_count,
  coalesce(sum(total), 0)::numeric(14,2) as total_amount
from public.quotes
group by status;

create or replace view public.dashboard_low_stock
with (security_invoker = true)
as
select id, sku, name, stock, active
from public.products
where active = true and stock <= 5
order by stock asc, name asc;

revoke all on table public.dashboard_metrics, public.dashboard_quote_status, public.dashboard_low_stock from anon, authenticated;
grant select on table public.dashboard_metrics, public.dashboard_quote_status, public.dashboard_low_stock to authenticated;
