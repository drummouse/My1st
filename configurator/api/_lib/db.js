import { neon } from '@neondatabase/serverless';

// PROJECTS_DATABASE_URL is provisioned by the Vercel Neon Postgres
// integration (see db/schema.sql). Uses the HTTP-based neon() driver rather
// than a raw TCP client since Vercel serverless functions and this driver's
// fetch-based transport are the standard pairing for Neon.
export const sql = neon(process.env.PROJECTS_DATABASE_URL);

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
      // Reseller tier: a reseller creates/manages its own owner accounts
      // (scoped by this column — see api/superadmin/index.js's reseller
      // checks) without visibility into any tenant's private project data.
      // Null for accounts a superadmin created directly (or the reseller
      // accounts themselves). Self-referencing like status_changed_by above.
      await sql`alter table users add column if not exists reseller_id uuid references users(id)`;
      await sql`create index if not exists users_reseller_id_idx on users (reseller_id)`;
      // Billing/licensing isn't built yet — this is deliberately just a
      // free-form stub column so a future plan/tier system has somewhere to
      // land without another migration fire drill. Nothing reads it yet.
      await sql`alter table users add column if not exists plan text`;
      // A CHECK constraint can't be altered in place, so the existing one
      // (if any) is dropped and re-added with the current allowed set every
      // time — idempotent, and the only way to widen it as roles are added.
      await sql`alter table users drop constraint if exists users_role_check`;
      await sql`alter table users add constraint users_role_check check (role in ('owner', 'reseller', 'superadmin'))`;
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
      // describing one design. Originally a single global row (`singleton`
      // primary key); now one row per owner instead. The `singleton` column
      // is left in place for any table created by that earlier shape rather
      // than dropped (this codebase never does destructive migrations) —
      // it's simply unused going forward, and every real query filters by
      // `owner_id` via its own unique index, not by `singleton`.
      await sql`
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
        )
      `;
      await sql`alter table settings add column if not exists id uuid default gen_random_uuid()`;
      await sql`alter table settings add column if not exists owner_id uuid references users(id)`;
      await sql`create unique index if not exists settings_owner_id_key on settings (owner_id)`;
      await sql`alter table settings add column if not exists logo_url text`;
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

      // IronWrap Capture — additive only (Stage 1). Sessions carry the
      // server-side state machine (client sync states never land here);
      // client_ref makes draft creation idempotent across mobile retries.
      // Image bytes never live in these tables — capture_assets stores Blob
      // URLs and metadata only, matching the attachments precedent.
      await sql`
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
          submitted_at timestamptz,
          material_zone_state jsonb,
          texture_direction text check (texture_direction is null or texture_direction in ('along_run','across_coverage','custom','not_applicable')),
          studio_validation jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      // R2.5: additive/nullable — existing sessions are unaffected.
      await sql`alter table capture_sessions add column if not exists material_zone_state jsonb`;
      await sql`alter table capture_sessions add column if not exists texture_direction text`;
      await sql`alter table capture_sessions drop constraint if exists capture_sessions_texture_direction_check`;
      await sql`alter table capture_sessions add constraint capture_sessions_texture_direction_check
        check (texture_direction is null or texture_direction in ('along_run','across_coverage','custom','not_applicable'))`;
      await sql`alter table capture_sessions add column if not exists studio_validation jsonb`;
      await sql`create unique index if not exists capture_sessions_owner_client_ref_key on capture_sessions (owner_id, client_ref) where client_ref is not null`;
      await sql`create index if not exists capture_sessions_owner_status_idx on capture_sessions (owner_id, status)`;

      await sql`
        create table if not exists capture_assets (
          id uuid primary key default gen_random_uuid(),
          session_id uuid not null references capture_sessions(id) on delete cascade,
          owner_id uuid not null references users(id),
          purpose text not null check (purpose in ('main','front','back','edge','surface','label','packaging','profile','installed','other','left_end','right_end','top','bottom','iso_front_left','iso_front_right')),
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
          superseded_by uuid references capture_assets(id),
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists capture_assets_session_id_idx on capture_assets (session_id)`;
      // R2.2: an accepted source image is never overwritten. Replacing it
      // inserts a fresh immutable asset and points the OLD row at the new
      // one via this column — additive metadata only, every other column on
      // the superseded row (url/checksum/capture_metadata/timestamps) stays
      // exactly as originally accepted (decision D-039).
      await sql`alter table capture_assets add column if not exists superseded_by uuid references capture_assets(id)`;

      await sql`
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
        )
      `;

      await sql`
        create table if not exists capture_review_comments (
          id uuid primary key default gen_random_uuid(),
          session_id uuid not null references capture_sessions(id) on delete cascade,
          author_id uuid not null references users(id),
          body text not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists capture_review_comments_session_id_idx on capture_review_comments (session_id)`;

      // Slice R1 widening: tables created by the Stage 1 shape carry the
      // narrower CHECK lists, so drop and re-add with the current allowed
      // values — same idempotent pattern as users_role_check above. The
      // create-table literals above already carry the widened lists for
      // fresh databases.
      await sql`alter table capture_sessions drop constraint if exists capture_sessions_capture_type_check`;
      await sql`alter table capture_sessions add constraint capture_sessions_capture_type_check check (capture_type in ('guided_product','quick','texture','color','profile','label','profile_geometry','color_finish'))`;
      await sql`alter table capture_assets drop constraint if exists capture_assets_purpose_check`;
      await sql`alter table capture_assets add constraint capture_assets_purpose_check check (purpose in ('main','front','back','edge','surface','label','packaging','profile','installed','other','left_end','right_end','top','bottom','iso_front_left','iso_front_right'))`;

      // Real-world measurements with provenance (Slice R1; supersedes the
      // JSON-blob dimensions approach for scan sessions — D-010 revisited).
      // Values never live in Blob storage and images never live here.
      await sql`
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
        )
      `;
      await sql`create index if not exists capture_measurements_session_id_idx on capture_measurements (session_id)`;

      // Claude adaptive-guidance attempts (R2.4, D-044) — one immutable,
      // append-only row per attempt (success or not), kept in its own
      // namespace: 'findings' only populated for status='advisory'
      // (validated, policy-passed responses); every other status carries a
      // non-sensitive 'diagnostic' instead. No image bytes ever stored here.
      await sql`
        create table if not exists capture_claude_analyses (
          id uuid primary key default gen_random_uuid(),
          session_id uuid not null references capture_sessions(id) on delete cascade,
          owner_id uuid not null references users(id),
          status text not null check (status in
            ('advisory','disabled','unavailable','no_images_available','timeout','error','invalid')),
          model text,
          prompt_version text,
          schema_version integer,
          source_asset_ids jsonb not null default '[]'::jsonb,
          findings jsonb,
          diagnostic jsonb not null default '{}'::jsonb,
          fulfilled_asset_id uuid references capture_assets(id),
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists capture_claude_analyses_session_id_idx on capture_claude_analyses (session_id)`;
    })().catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}
