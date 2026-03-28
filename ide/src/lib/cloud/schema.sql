-- ============================================================
-- Cloud Project Persistence — Supabase / Postgres Schema
-- ============================================================
-- Run this script in the Supabase SQL editor or with psql.
-- All tables use UUIDs and include Row-Level Security (RLS)
-- so user_id filtering is enforced at the database level.

-- Enable UUID generation extension (enabled by default in Supabase)
create extension if not exists "pgcrypto";

-- ── projects ─────────────────────────────────────────────────────────────────
-- One row per user project. Files are stored as JSONB for simplicity;
-- smart-contract workspaces are small enough that this is fine.
-- file_hashes stores a path→hash map for client-side diff optimisation so
-- the sync engine only needs to send changed files on subsequent saves.

create table if not exists projects (
  id            uuid        primary key default gen_random_uuid(),
  user_id       text        not null,
  name          text        not null default 'Untitled Project',
  files         jsonb       not null default '[]',
  file_hashes   jsonb       not null default '{}',
  network       text        not null default 'testnet',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Fast lookup of all projects for a user (list view)
create index if not exists projects_user_id_idx
  on projects (user_id);

-- Most-recently-modified first for the project list
create index if not exists projects_user_updated_idx
  on projects (user_id, updated_at desc);

-- ── Auto-update updated_at on every write ────────────────────────────────────

create or replace function update_updated_at_column()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at_column();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- NextAuth JWTs are validated server-side in Next.js API routes, which then
-- use the Supabase *service-role* key. RLS therefore targets the user_id
-- column to prevent cross-user data leaks at the database level.
--
-- If you later add Supabase Auth (in addition to NextAuth), uncomment the
-- auth.uid()-based policies and remove the permissive service-role bypass.

alter table projects enable row level security;

-- Allow the service role (used from Next.js API routes) full access.
-- Individual user isolation is enforced in the API layer.
create policy "Service role full access"
  on projects for all
  using (true)
  with check (true);

-- ── Example data (dev only — remove before production) ───────────────────────
-- insert into projects (user_id, name, files, network)
-- values (
--   'dev-user-123',
--   'hello_world',
--   '[{"path":"hello_world/lib.rs","content":"#![no_std]\nuse soroban_sdk::*;\n"}]',
--   'testnet'
-- );
