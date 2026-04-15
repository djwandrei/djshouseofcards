-- Supabase schema for DJ's House of Cards remote catalog
-- Run this in the Supabase SQL Editor.
--
-- What this version fixes:
-- - Safe to rerun on an existing project
-- - Grants table access to anon/authenticated so PostgREST can see the table
-- - Recreates policies cleanly instead of failing on duplicate policy names
-- - Refreshes the PostgREST schema cache at the end

create schema if not exists public;

create table if not exists public.products (
  id bigint primary key,
  name text not null,
  category text not null,
  team text,
  year integer,
  condition text,
  price numeric,
  price_label text,
  image text,
  image_gallery jsonb not null default '[]'::jsonb,
  description text,
  photo_host_page_url text,
  legacy_image_label text,
  source_page text,
  league text,
  sport text,
  player_athlete text,
  display_price text,
  copy_count integer,
  item_photo_url text,
  item_photo_urls jsonb not null default '[]'::jsonb,
  html_full_link text,
  html_image_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_featured boolean not null default false,
  is_deleted boolean not null default false,
  sort_rank integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists team text;
alter table public.products add column if not exists year integer;
alter table public.products add column if not exists condition text;
alter table public.products add column if not exists price numeric;
alter table public.products add column if not exists price_label text;
alter table public.products add column if not exists image text;
alter table public.products add column if not exists image_gallery jsonb default '[]'::jsonb;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists photo_host_page_url text;
alter table public.products add column if not exists legacy_image_label text;
alter table public.products add column if not exists source_page text;
alter table public.products add column if not exists league text;
alter table public.products add column if not exists sport text;
alter table public.products add column if not exists player_athlete text;
alter table public.products add column if not exists display_price text;
alter table public.products add column if not exists copy_count integer;
alter table public.products add column if not exists item_photo_url text;
alter table public.products add column if not exists item_photo_urls jsonb default '[]'::jsonb;
alter table public.products add column if not exists html_full_link text;
alter table public.products add column if not exists html_image_urls jsonb default '[]'::jsonb;
alter table public.products add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.products add column if not exists is_featured boolean default false;
alter table public.products add column if not exists is_deleted boolean default false;
alter table public.products add column if not exists sort_rank integer default 0;
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

update public.products set image_gallery = '[]'::jsonb where image_gallery is null;
update public.products set item_photo_urls = '[]'::jsonb where item_photo_urls is null;
update public.products set html_image_urls = '[]'::jsonb where html_image_urls is null;
update public.products set metadata = '{}'::jsonb where metadata is null;
update public.products set is_featured = false where is_featured is null;
update public.products set is_deleted = false where is_deleted is null;
update public.products set sort_rank = 0 where sort_rank is null;
update public.products set created_at = now() where created_at is null;
update public.products set updated_at = now() where updated_at is null;

alter table public.products alter column image_gallery set default '[]'::jsonb;
alter table public.products alter column image_gallery set not null;
alter table public.products alter column item_photo_urls set default '[]'::jsonb;
alter table public.products alter column item_photo_urls set not null;
alter table public.products alter column html_image_urls set default '[]'::jsonb;
alter table public.products alter column html_image_urls set not null;
alter table public.products alter column metadata set default '{}'::jsonb;
alter table public.products alter column metadata set not null;
alter table public.products alter column is_featured set default false;
alter table public.products alter column is_featured set not null;
alter table public.products alter column is_deleted set default false;
alter table public.products alter column is_deleted set not null;
alter table public.products alter column sort_rank set default 0;
alter table public.products alter column sort_rank set not null;
alter table public.products alter column created_at set default now();
alter table public.products alter column created_at set not null;
alter table public.products alter column updated_at set default now();
alter table public.products alter column updated_at set not null;

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_products_updated_at();

alter table public.products enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated;
grant all on table public.products to service_role;

drop policy if exists "Public can read visible products" on public.products;
create policy "Public can read visible products"
on public.products
for select
to anon, authenticated
using (is_deleted = false);

drop policy if exists "Admin can manage products" on public.products;
create policy "Admin can manage products"
on public.products
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'djwandrei@gmail.com')
with check ((auth.jwt() ->> 'email') = 'djwandrei@gmail.com');

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admin can upload product images" on storage.objects;
create policy "Admin can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (auth.jwt() ->> 'email') = 'djwandrei@gmail.com'
);

drop policy if exists "Admin can update product images" on storage.objects;
create policy "Admin can update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (auth.jwt() ->> 'email') = 'djwandrei@gmail.com'
)
with check (
  bucket_id = 'product-images'
  and (auth.jwt() ->> 'email') = 'djwandrei@gmail.com'
);

drop policy if exists "Admin can delete product images" on storage.objects;
create policy "Admin can delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (auth.jwt() ->> 'email') = 'djwandrei@gmail.com'
);

notify pgrst, 'reload schema';
