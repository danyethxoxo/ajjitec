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
