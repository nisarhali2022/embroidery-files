-- Embroidery File Exchange: Supabase setup
-- Run this ONCE in Supabase > SQL Editor, AFTER creating the two users
-- (admin@example.com and embroider@example.com) under Authentication > Users.

-- 1. Profiles: links each login to its role ---------------------------------
create table if not exists public.profiles (
  id       uuid primary key references auth.users on delete cascade,
  username text not null unique,
  role     text not null check (role in ('admin', 'embroider'))
);
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

insert into public.profiles (id, username, role)
select id, split_part(email, '@', 1), split_part(email, '@', 1)
from auth.users
where email in ('admin@example.com', 'embroider@example.com')
on conflict (id) do nothing;

-- Returns the role of whoever is signed in ('admin', 'embroider' or null)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- 2. Files table: one row per uploaded file ---------------------------------
create table if not exists public.files (
  id          bigint generated always as identity primary key,
  tab         text not null check (tab in ('images', 'embroidery')),
  name        text not null,               -- original file name, shown in the table
  path        text not null unique,        -- where the file sits in storage
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null default auth.uid() references auth.users
);
alter table public.files enable row level security;

drop policy if exists "both users can see files" on public.files;
create policy "both users can see files" on public.files
  for select to authenticated using (public.my_role() is not null);

-- Admin uploads to Images, embroider uploads to Embroidery Files.
-- The allowed file types here must match TYPES in app.js.
drop policy if exists "upload to own tab" on public.files;
create policy "upload to own tab" on public.files
  for insert to authenticated with check (
    uploaded_by = auth.uid() and (
      (tab = 'images' and public.my_role() = 'admin'
        and lower(name) ~ '\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff|svg|heic|pdf|ai|eps|psd|cdr)$')
      or
      (tab = 'embroidery' and public.my_role() = 'embroider'
        and lower(name) ~ '\.(dst|pes|pec|emb|jef|exp|vp3|vip|hus|xxx|sew|csd|dsb|dsz|pxf|ofm|u01|tap|ksm|art|shv|jpx|10o)$')
    )
  );

drop policy if exists "admin deletes" on public.files;
create policy "admin deletes" on public.files
  for delete to authenticated using (public.my_role() = 'admin');

-- 3. Storage bucket (private) and its rules ---------------------------------
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

drop policy if exists "exchange: read" on storage.objects;
create policy "exchange: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and public.my_role() is not null);

drop policy if exists "exchange: upload" on storage.objects;
create policy "exchange: upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'files' and (
      ((storage.foldername(name))[1] = 'images'     and public.my_role() = 'admin') or
      ((storage.foldername(name))[1] = 'embroidery' and public.my_role() = 'embroider')
    )
  );

drop policy if exists "exchange: delete" on storage.objects;
create policy "exchange: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and public.my_role() = 'admin');

-- 4. Let signed-in users reach the tables through the API -------------------
-- (Needed when "Grant API access to new tables automatically" was left off.
--  The row rules above still decide what each person can actually do.)
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.files to authenticated;
grant execute on function public.my_role() to authenticated;

-- Check: this should list both users with their roles
select username, role from public.profiles;
