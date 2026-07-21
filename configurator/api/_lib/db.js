import { neon } from '@neondatabase/serverless';

// GPT_DATABASE_URL is the isolated GPT sandbox connection. Keep
// PROJECTS_DATABASE_URL as the compatibility fallback for existing Vercel
// deployments. Uses the HTTP-based neon() driver rather than a raw TCP client
// since Vercel serverless functions and this driver's fetch-based transport
// are the standard pairing for Neon.
const databaseUrl = process.env.GPT_DATABASE_URL ?? process.env.PROJECTS_DATABASE_URL;
export const sql = neon(databaseUrl);

let schemaReady;

// Runs once per warm serverless instance (cached promise) — idempotent, so
// a cold start on every instance just re-confirms the schema exists. If that
// one attempt fails (a transient Neon connectivity blip, for example), the
// cache is cleared so the next call retries instead of permanently wedging
// this warm instance on the same stale error.
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`create extension if not exists pgcrypto`;

      // One row per signed-up contractor/company — the tenant boundary every
      // other table's owner_id points at. No shared multi-seat accounts in
      // v1 (one login = one owner), by design, kept deliberately simple.
      await sql`
        create table if not exists users (
          id uuid primary key default gen_random_uuid(),
          email text unique not null,
          password_hash text not null,
          company_name text,
          created_at timestamptz not null default now()
        )
      `;
      // Required at signup (see AuthGate.jsx): either first_name+last_name
      // or business_name, plus phone and a full address. website/social_url
      // are optional and only ever shown where explicitly non-blank (PDF
      // cover page). All additive/nullable so existing accounts (created
      // before this requirement existed) don't break.
      await sql`alter table users add column if not exists first_name text`;
      await sql`alter table users add column if not exists last_name text`;
      await sql`alter table users add column if not exists business_name text`;
      await sql`alter table users add column if not exists phone text`;
      await sql`alter table users add column if not exists address_line text`;
      await sql`alter table users add column if not exists city text`;
      await sql`alter table users add column if not exists region_code text`;
      await sql`alter table users add column if not exists postal_code text`;
      await sql`alter table users add column if not exists website text`;
      await sql`alter table users add column if not exists social_url text`;
      // Roles are deliberately additive here; authorization is capability-
      // based in superadminPolicy.js and never inferred from client state.
      await sql`alter table users add column if not exists role text not null default 'owner'`;
      await sql`update users set role = 'owner' where role = 'developer'`;
      await sql`alter table users add column if not exists status text not null default 'active'`;
      await sql`alter table users add column if not exists status_reason text`;
      await sql`alter table users add column if not exists status_changed_at timestamptz`;
      await sql`alter table users add column if not exists status_changed_by uuid references users(id)`;
      await sql`alter table users add column if not exists last_login_at timestamptz`;
      await sql`alter table users add column if not exists session_version integer not null default 1`;
      await sql`alter table users add column if not exists must_change_password boolean not null default false`;
      await sql`alter table users add column if not exists deleted_at timestamptz`;
      await sql`alter table users add column if not exists purge_after timestamptz`;
      await sql`
        do $$ begin
          alter table users add constraint users_role_check check (role in ('owner', 'superadmin'));
        exception when duplicate_object then null;
        end $$
      `;
      await sql`
        do $$ begin
          alter table users add constraint users_status_check check (status in ('active', 'frozen', 'blocked', 'deleted'));
        exception when duplicate_object then null;
        end $$
      `;

      await sql`
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
        )
      `;
      await sql`
        create table if not exists notification_outbox (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users(id),
          channel text not null,
          template text not null,
          payload jsonb not null,
          status text not null default 'pending',
          attempt_count integer not null default 0,
          next_attempt_at timestamptz not null default now(),
          last_error text,
          sent_at timestamptz,
          support_reference text not null,
          created_at timestamptz not null default now()
        )
      `;

      await sql`
        create table if not exists projects (
          id uuid primary key default gen_random_uuid(),
          job_number text,
          customer_name text,
          address text,
          design jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      // Customer acceptance — added on an existing table via ALTER, since
      // "create table if not exists" won't add columns to a table that's
      // already there.
      await sql`alter table projects add column if not exists approved_at timestamptz`;
      await sql`alter table projects add column if not exists approved_by_name text`;
      // Multi-tenancy: which signed-up user this project belongs to. Nullable
      // so projects saved before accounts existed don't become orphaned by
      // the migration; ownerless rows just aren't returned by the
      // authenticated list route anymore.
      await sql`alter table projects add column if not exists owner_id uuid references users(id)`;
      await sql`create index if not exists projects_owner_id_idx on projects (owner_id)`;

      // Company-wide defaults (GST rate, package-deal percentages,
      // new-project defaults) — deliberately separate from the per-project
      // `design` JSONB, since these apply across every project rather than
      // describing one design. Originally a single global row keyed by the
      // `singleton` boolean; the additive migration below promotes `id` to
      // the primary key and makes singleton inert so multiple owner rows can
      // coexist without deleting the legacy row or column.
      await sql`
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
        )
      `;
      await sql`alter table settings add column if not exists id uuid default gen_random_uuid()`;
      // Drop only constraints that actually depend on the legacy singleton
      // column. This avoids assuming generated constraint names and will not
      // remove a newer id-based primary key on subsequent cold starts.
      await sql`
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
        end $$
      `;
      await sql`alter table settings alter column singleton drop default`;
      await sql`alter table settings alter column singleton drop not null`;
      await sql`update settings set id = gen_random_uuid() where id is null`;
      await sql`alter table settings alter column id set default gen_random_uuid()`;
      await sql`alter table settings alter column id set not null`;
      await sql`
        do $$ begin
          if not exists (
            select 1 from pg_constraint
            where conrelid = 'settings'::regclass and contype = 'p'
          ) then
            alter table settings add primary key (id);
          end if;
        exception when duplicate_object then null;
        end $$
      `;
      await sql`alter table settings add column if not exists owner_id uuid references users(id)`;
      await sql`create unique index if not exists settings_owner_id_key on settings (owner_id)`;
      await sql`alter table settings add column if not exists logo_url text`;
      await sql`alter table settings add column if not exists unit_system text not null default 'imperial' check (unit_system in ('imperial', 'metric'))`;
      // Tenant feature state. The entitlement is SuperAdmin-controlled; the
      // preference is tenant-controlled only when that entitlement resolves
      // true. Both default closed for existing and newly-created tenants.
      await sql`alter table settings add column if not exists expert_mode_enabled boolean not null default false`;
      await sql`alter table settings add column if not exists show_expert_mode boolean not null default false`;
      // Tax jurisdiction: base rate stays in the existing gst_rate column
      // (originally Alberta-only, now this owner's region's rate, still
      // editable/overridable) plus its country/region code and display
      // label (GST/HST/State/...), and an optional local add-on rate summed
      // with it at estimate time — see src/data/taxRates.js.
      await sql`alter table settings add column if not exists tax_country text`;
      await sql`alter table settings add column if not exists tax_region text`;
      await sql`alter table settings add column if not exists tax_label text`;
      await sql`alter table settings add column if not exists municipal_tax_rate numeric not null default 0`;
      // Generalized discount rules (replaces the three hardcoded package
      // deals). Null means "not customized yet" — pricingEngine.js seeds the
      // same three rules from full_wrap_discount_pct/soffit_fascia_discount_pct/
      // gutter_downspout_free in that case, so behavior is unchanged until an
      // admin edits a rule in the Discounts panel. Those three legacy columns
      // are left in place (never dropped) as that fallback's source values.
      await sql`alter table settings add column if not exists discount_rules jsonb`;
      // Where api/projects/[[...id]].js's approve route POSTs a
      // design.approved event (see INTEGRATIONS.md) — null means "not
      // configured," in which case approval just skips the notification.
      await sql`alter table settings add column if not exists notification_webhook_url text`;
      // Which custom_services catalog entries a brand-new project starts
      // with already enabled — same "New Project defaults" idea as
      // default_services, just for the owner's own custom catalog instead
      // of the fixed roof/wall/soffit/... set.
      await sql`alter table settings add column if not exists default_custom_service_ids jsonb`;
      // Library-backed defaults coexist with legacy defaults. Null means an
      // owner has not migrated yet; [] means they explicitly chose none.
      await sql`alter table settings add column if not exists default_catalog_items jsonb`;

      // Owner-defined services beyond the fixed roof/wall/soffit/etc. set —
      // a simple name+price+unit+description(+link) catalog, not a formula
      // engine. Selected instances (with a qty frozen at save time) live in
      // a project's own `design` JSONB, same as every other selection —
      // this table is just the reusable catalog admins pick from.
      await sql`
        create table if not exists custom_services (
          id uuid primary key default gen_random_uuid(),
          owner_id uuid references users(id),
          name text not null,
          unit text not null default 'each',
          price numeric not null default 0,
          description text,
          link_url text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists custom_services_owner_id_idx on custom_services (owner_id)`;

      // Materials & Colors Library — owner-added entries layered on top of
      // the app's baseline ROOF_PRODUCTS/WALL_PRODUCTS/RAL_COLORS catalogs
      // (see src/data/pricing.js and colors.js's allRoofProducts()/
      // allWallProducts()/allColors()).
      await sql`
        create table if not exists colors (
          id uuid primary key default gen_random_uuid(),
          owner_id uuid references users(id),
          name text not null,
          code text,
          hex text not null default '#888888',
          series text not null default 'Custom',
          thumbnail_url text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists colors_owner_id_idx on colors (owner_id)`;

      await sql`
        create table if not exists materials (
          id uuid primary key default gen_random_uuid(),
          owner_id uuid references users(id),
          name text not null,
          kind text not null default 'roof',
          price_per_sqft numeric not null default 0,
          profiles jsonb,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists materials_owner_id_idx on materials (owner_id)`;

      // Library organization: one folder tree per kind ('material'/'color'),
      // arbitrary nesting via self-referencing parent_id. A material sits in
      // at most one folder (folder_id below); a color can sit in several
      // (color_folders) — e.g. the same color showing up under both a
      // "Season Crop" and a "Cascadia Steel" color-line folder. Deleting a
      // folder just un-parents whatever was in it (`on delete set null`)
      // rather than cascading destructively.
      await sql`
        create table if not exists folders (
          id uuid primary key default gen_random_uuid(),
          owner_id uuid references users(id),
          kind text not null,
          parent_id uuid references folders(id) on delete set null,
          name text not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists folders_owner_id_idx on folders (owner_id)`;

      await sql`alter table materials add column if not exists folder_id uuid references folders(id) on delete set null`;

      await sql`
        create table if not exists color_folders (
          color_id uuid not null references colors(id) on delete cascade,
          folder_id uuid not null references folders(id) on delete cascade,
          primary key (color_id, folder_id)
        )
      `;

      // "Which colors are applicable" to a material — a plain many-to-many;
      // a material with zero rows here means "not restricted yet," and the
      // in-project color picker keeps showing the full merged catalog until
      // an admin actually links at least one color (see ColorPickerButton.jsx).
      await sql`
        create table if not exists material_colors (
          material_id uuid not null references materials(id) on delete cascade,
          color_id uuid not null references colors(id) on delete cascade,
          primary key (material_id, color_id)
        )
      `;

      // Library Core is an additive, versioned catalog. Existing materials
      // and colors remain the live configurator source until a later adapter
      // is verified; migration only copies and links their data.
      await sql`
        create table if not exists library_records (
          id uuid primary key,
          record_type text not null check (record_type in ('product','profile','color','category','manufacturer','supplier','collection','catalog')),
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
        )
      `;
      await sql`create unique index if not exists library_record_code_scope_unique on library_records (record_type, scope, coalesce(tenant_id::text, ''), lower(code)) where code is not null`;
      await sql`create index if not exists library_records_search_idx on library_records (record_type, scope, lifecycle_status, review_status, quality_level, lower(name))`;
      await sql`
        create table if not exists library_product_details (
          record_id uuid primary key references library_records(id),
          unit text,
          price numeric(14,4),
          application_metadata jsonb not null default '{}'::jsonb,
          legacy_material_id uuid
        )
      `;
      await sql`
        create table if not exists library_profile_details (
          record_id uuid primary key references library_records(id),
          profile_family text,
          geometry_metadata jsonb not null default '{}'::jsonb,
          legacy_profile_label text
        )
      `;
      await sql`
        create table if not exists library_color_details (
          record_id uuid primary key references library_records(id),
          color_code text,
          hex text,
          series text,
          legacy_color_id uuid
        )
      `;
      await sql`
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
        )
      `;
      await sql`
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
        )
      `;
      await sql`
        create table if not exists library_document_records (
          document_id uuid not null references library_documents(id),
          record_id uuid not null references library_records(id),
          primary key (document_id, record_id)
        )
      `;
      await sql`
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
        )
      `;
      await sql`
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
        )
      `;

      // Per-project attachments — Attach File (any format, always a link in
      // every report) and Attach Photo (images only, embedded as a small
      // thumbnail in the PDF). `on delete cascade` since an attachment has
      // no meaning once its project is gone.
      await sql`
        create table if not exists attachments (
          id uuid primary key default gen_random_uuid(),
          project_id uuid not null references projects(id) on delete cascade,
          kind text not null,
          file_name text not null,
          url text not null,
          mime_type text,
          size_bytes bigint not null default 0,
          uploaded_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists attachments_project_id_idx on attachments (project_id)`;
    })().catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}
