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

alter table projects add column if not exists approved_at timestamptz;
alter table projects add column if not exists approved_by_name text;

create index if not exists projects_updated_at_idx on projects (updated_at desc);

-- Single-row company-wide defaults (GST rate, package-deal percentages, and
-- new-project defaults), separate from the per-project `design` JSONB since
-- these apply across every project rather than describing one design.
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
