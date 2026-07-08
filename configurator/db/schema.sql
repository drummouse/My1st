-- Projects table for the IronWrap 3D Configurator's save/load/edit feature.
-- Applied automatically on first API request (see api/_lib/db.js); this file
-- is kept for reference and manual application if ever needed.

create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  customer_name text,
  address text,
  design jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_updated_at_idx on projects (updated_at desc);
