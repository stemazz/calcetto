-- ============================================================================
-- STUB LOCALI di Supabase (solo per testare la logica in PostgreSQL locale).
-- NON eseguire su Supabase: lì esistono già gli schemi auth e storage.
-- ============================================================================
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id text default '00000000-0000-0000-0000-000000000000',
  aud text default 'authenticated',
  role text default 'authenticated',
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{"provider":"email","providers":["email"]}'::jsonb
);

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid,
  metadata jsonb
);
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

-- auth.uid() come in Supabase: legge la variabile di sessione
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ruolo non superuser per testare davvero le policy RLS
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Per i test locali: il ruolo authenticated deve poter leggere auth.users
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
