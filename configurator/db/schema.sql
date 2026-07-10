-- Projects table for the IronWrap 3D Configurator's save/load/edit feature.
-- Applied automatically on first API request (see api/_lib/db.js); this file
-- is kept for reference and manual application if ever needed.

create extension if not exists pgcrypto;

-- One row per signed-up contractor/company account — the tenant boundary
-- every other table's owner_id points at. One login = one owner in v1.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  company_name text,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  customer_name text,
  address text,
  design jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects add column if not exists approved_at timestamptz;
alter table projects add column if not exists approved_by_name text;
alter table projects add column if not exists owner_id uuid references users(id);

create index if not exists projects_updated_at_idx on projects (updated_at desc);
create index if not exists projects_owner_id_idx on projects (owner_id);

-- Company-wide defaults (GST rate, package-deal percentages, and new-project
-- defaults), separate from the per-project `design` JSONB since these apply
-- across every project rather than describing one design. Originally a
-- single global row (`singleton` primary key); now one row per owner —
-- `singleton` is left in place rather than dropped (no destructive
-- migrations in this schema), just unused going forward.
create table if not exists settings (
  singleton boolean primary key default true check (singleton),
  gst_rate numeric not null default 0.05,
  full_wrap_discount_pct numeric not null default 0.07,
  soffit_fascia_discount_pct numeric not null default 0.5,
  gutter_downspout_free boolean not null default true,
  default_services jsonb,
  default_locked_services jsonb,
  default_accessory_colors jsonb,
  default_roof_color_id text,
  default_wall_color_id text,
  report_footer_note text,
  updated_at timestamptz not null default now()
);

alter table settings add column if not exists id uuid default gen_random_uuid();
alter table settings add column if not exists owner_id uuid references users(id);
create unique index if not exists settings_owner_id_key on settings (owner_id);
