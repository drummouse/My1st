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

alter table users add column if not exists role text not null default 'owner';
update users set role = 'owner' where role = 'developer';
alter table users add column if not exists status text not null default 'active';
alter table users add column if not exists status_reason text;
alter table users add column if not exists status_changed_at timestamptz;
alter table users add column if not exists status_changed_by uuid references users(id);
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists session_version integer not null default 1;
alter table users add column if not exists must_change_password boolean not null default false;
alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists purge_after timestamptz;
alter table users add column if not exists reseller_id uuid references users(id);
create index if not exists users_reseller_id_idx on users (reseller_id);
alter table users add column if not exists plan text;

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner', 'reseller', 'superadmin'));

do $$ begin
  alter table users add constraint users_status_check check (status in ('active', 'frozen', 'blocked', 'deleted'));
exception when duplicate_object then null;
end $$;

create table if not exists superadmin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  support_reference text,
  result text not null default 'succeeded',
  created_at timestamptz not null default now()
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  channel text not null,
  template text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  support_reference text not null,
  created_at timestamptz not null default now(),
  sender_user_id uuid references users(id),
  to_email text,
  to_phone text,
  claimed_at timestamptz,
  error_category text
);

-- A reseller/owner's comms preference — not a dedicated sending account.
-- 'platform' sends ride the platform's one shared Twilio number/Gmail
-- account; only the message signature/Reply-To vary by tenant. See
-- api/_lib/db.js's ensureSchema() for the full rationale.
create table if not exists sender_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  notify_mode text not null default 'self' check (notify_mode in ('platform', 'self')),
  display_name text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sender_identities_user_id_key on sender_identities (user_id);

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
alter table projects add column if not exists customer_email text;
alter table projects add column if not exists customer_phone text;

create index if not exists projects_updated_at_idx on projects (updated_at desc);
create index if not exists projects_owner_id_idx on projects (owner_id);

-- Company-wide defaults (GST rate, package-deal percentages, and new-project
-- defaults), separate from the per-project `design` JSONB since these apply
-- across every project rather than describing one design. Originally a
-- single global row keyed by `singleton`; now one row per owner. The
-- migration keeps that legacy column/data but makes it inert and promotes
-- the generated id to the primary key.
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean,
  gst_rate numeric not null default 0.05,
  full_wrap_discount_pct numeric not null default 0.07,
  soffit_fascia_discount_pct numeric not null default 0.5,
  gutter_downspout_free boolean not null default true,
  default_services jsonb,
  default_locked_services jsonb,
  default_accessory_colors jsonb,
  default_roof_color_id text,
  default_wall_color_id text,
  default_catalog_items jsonb,
  report_footer_note text,
  updated_at timestamptz not null default now()
);

alter table settings add column if not exists id uuid default gen_random_uuid();
do $$ declare legacy_constraint record;
begin
  for legacy_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'settings'::regclass
      and (
        (c.contype = 'p' and exists (
          select 1
          from unnest(c.conkey) as key(attnum)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
          where a.attname = 'singleton'
        ))
        or (c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%singleton%')
      )
  loop
    execute format('alter table settings drop constraint %I', legacy_constraint.conname);
  end loop;
end $$;
alter table settings alter column singleton drop default;
alter table settings alter column singleton drop not null;
update settings set id = gen_random_uuid() where id is null;
alter table settings alter column id set default gen_random_uuid();
alter table settings alter column id set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'settings'::regclass and contype = 'p'
  ) then
    alter table settings add primary key (id);
  end if;
exception when duplicate_object then null;
end $$;
alter table settings add column if not exists owner_id uuid references users(id);
alter table settings add column if not exists default_custom_service_ids jsonb;
alter table settings add column if not exists default_catalog_items jsonb;
create unique index if not exists settings_owner_id_key on settings (owner_id);
alter table settings add column if not exists unit_system text not null default 'imperial' check (unit_system in ('imperial', 'metric'));
alter table settings add column if not exists expert_mode_enabled boolean not null default false;
alter table settings add column if not exists show_expert_mode boolean not null default false;

-- Unified Library Core. These tables are additive; legacy materials and
-- colors remain the configurator runtime source during this release.
create table if not exists library_records (
  id uuid primary key,
  record_type text not null check (record_type in ('product','profile','color','texture','category','manufacturer','supplier','collection','catalog')),
  scope text not null check (scope in ('global','tenant')),
  tenant_id uuid references users(id),
  name text not null,
  code text,
  description text,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','archived')),
  review_status text not null default 'draft' check (review_status in ('draft','pending_review','approved','rejected')),
  quality_level text not null default 'test' check (quality_level in ('test','low','standard','verified')),
  version integer not null default 1 check (version > 0),
  source_type text not null default 'manual' check (source_type in ('manual','legacy_migration','import','manufacturer','supplier','capture')),
  external_reference text,
  source_url text,
  attribution text,
  thumbnail_url text,
  texture_url text,
  geometry_url text,
  knowledge_space_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and tenant_id is null) or (scope = 'tenant' and tenant_id is not null))
);
create unique index if not exists library_record_code_scope_unique on library_records (record_type, scope, coalesce(tenant_id::text, ''), lower(code)) where code is not null;
create index if not exists library_records_search_idx on library_records (record_type, scope, lifecycle_status, review_status, quality_level, lower(name));

create table if not exists library_product_details (
  record_id uuid primary key references library_records(id),
  unit text,
  price numeric(14,4),
  application_metadata jsonb not null default '{}'::jsonb,
  legacy_material_id uuid
);
create table if not exists library_profile_details (
  record_id uuid primary key references library_records(id),
  profile_family text,
  geometry_metadata jsonb not null default '{}'::jsonb,
  legacy_profile_label text
);
create table if not exists library_color_details (
  record_id uuid primary key references library_records(id),
  color_code text,
  hex text,
  series text,
  legacy_color_id uuid
);
create table if not exists library_relationships (
  id uuid primary key,
  source_record_id uuid not null references library_records(id),
  target_record_id uuid not null references library_records(id),
  relationship_type text not null,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','archived')),
  version integer not null default 1 check (version > 0),
  attribution text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_record_id, target_record_id, relationship_type)
);
create table if not exists library_documents (
  id uuid primary key,
  title text not null,
  document_type text not null,
  url text not null,
  publisher text,
  jurisdiction text,
  effective_date date,
  expiry_date date,
  language text,
  checksum text,
  review_status text not null default 'draft' check (review_status in ('draft','pending_review','approved','rejected')),
  is_official boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists library_document_records (
  document_id uuid not null references library_documents(id),
  record_id uuid not null references library_records(id),
  primary key (document_id, record_id)
);
create table if not exists library_import_batches (
  id uuid primary key,
  actor_id uuid not null references users(id),
  scope text not null check (scope in ('global','tenant')),
  tenant_id uuid references users(id),
  schema_version integer not null,
  source_format text not null check (source_format in ('json','csv')),
  status text not null check (status in ('dry_run','committed','failed')),
  support_reference text not null,
  summary jsonb not null default '{}'::jsonb,
  decisions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
-- IronWrap Capture — additive only (Stage 1). Sessions carry the server-side
-- state machine; client_ref makes draft creation idempotent. Image bytes
-- never live in these tables — capture_assets stores Blob URLs and metadata.
create table if not exists capture_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id),
  client_ref text,
  capture_type text not null default 'guided_product'
    check (capture_type in ('guided_product','quick','texture','color','profile','label','profile_geometry','color_finish')),
  category text check (category is null or category in ('roofing','siding','soffit','fascia','gutter','downspout','trim','accessory','other')),
  title text,
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','changes_requested','approved','publishing','published','rejected','archived')),
  current_step text,
  completeness integer not null default 0,
  submitted_snapshot jsonb,
  published_record_id uuid references library_records(id),
  published_version integer,
  tags jsonb not null default '[]'::jsonb,
  item_type text check (item_type is null or item_type in ('profile','commercial_product','custom_object','assembly','decorative','unknown')),
  submitted_at timestamptz,
  -- R2.5: material-ready schematic proof — additive/nullable.
  material_zone_state jsonb,
  texture_direction text check (texture_direction is null or texture_direction in ('along_run','across_coverage','custom','not_applicable')),
  studio_validation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists capture_sessions_owner_client_ref_key on capture_sessions (owner_id, client_ref) where client_ref is not null;
create index if not exists capture_sessions_owner_status_idx on capture_sessions (owner_id, status);

-- Shot purpose/label is an open vocabulary (flexible-tags slice, spec §18):
-- no closed-list CHECK; api/_lib/capturePolicy.js bounds and sanitizes it.
create table if not exists capture_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  owner_id uuid not null references users(id),
  purpose text not null,
  classification text not null default 'source' check (classification in ('source','derived')),
  source_asset_id uuid references capture_assets(id),
  url text not null,
  checksum text,
  mime_type text,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  capture_metadata jsonb not null default '{}'::jsonb,
  upload_status text not null default 'complete' check (upload_status in ('pending','complete','failed')),
  -- R2.2: points a superseded (replaced) source asset at its replacement.
  -- The superseded row's other columns are never changed — see D-039.
  superseded_by uuid references capture_assets(id),
  created_at timestamptz not null default now()
);
create index if not exists capture_assets_session_id_idx on capture_assets (session_id);

create table if not exists capture_fields (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  field_key text not null,
  value jsonb,
  source text not null default 'manual' check (source in ('manual','barcode','ocr','ai','imported','reviewer')),
  confidence numeric,
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  source_asset_id uuid references capture_assets(id),
  updated_at timestamptz not null default now(),
  unique (session_id, field_key)
);

create table if not exists capture_review_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Real-world measurements with provenance (Scanner Slice R1).
create table if not exists capture_measurements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  owner_id uuid not null references users(id),
  feature text not null,
  axis text check (axis is null or axis in ('width','height','depth','length')),
  value numeric not null,
  unit text not null check (unit in ('mm','cm','in','ft')),
  method text not null default 'manual' check (method in ('manual','ruler','marker','inferred')),
  confidence numeric,
  source_asset_id uuid references capture_assets(id),
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists capture_measurements_session_id_idx on capture_measurements (session_id);

-- Claude adaptive-guidance attempts (Scanner R2.4, D-044) — one immutable,
-- append-only row per attempt. 'findings' only populated for
-- status='advisory'; every other status carries a non-sensitive
-- 'diagnostic' instead. No image bytes ever stored here.
create table if not exists capture_claude_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  owner_id uuid not null references users(id),
  status text not null check (status in
    ('advisory','disabled','unavailable','configuration_error','no_images_available','timeout','error','invalid')),
  model text,
  prompt_version text,
  schema_version integer,
  source_asset_ids jsonb not null default '[]'::jsonb,
  findings jsonb,
  diagnostic jsonb not null default '{}'::jsonb,
  fulfilled_asset_id uuid references capture_assets(id),
  created_at timestamptz not null default now()
);
create index if not exists capture_claude_analyses_session_id_idx on capture_claude_analyses (session_id);
create index if not exists capture_review_comments_session_id_idx on capture_review_comments (session_id);

-- Tenant-scoped tag vocabulary (Scanner flexible-tags slice). No platform
-- seed set in this slice — deferred, see CAPTURE_DECISION_LOG.md.
create table if not exists capture_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id),
  tag text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (owner_id, tag)
);
create index if not exists capture_tags_owner_id_idx on capture_tags (owner_id);

create table if not exists library_migrations (
  id uuid primary key,
  migration_key text not null,
  tenant_id uuid not null references users(id),
  version integer not null,
  status text not null check (status in ('running','completed','failed')),
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (migration_key)
);
