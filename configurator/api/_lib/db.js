import { neon } from '@neondatabase/serverless';

// PROJECTS_DATABASE_URL is provisioned by the Vercel Neon Postgres
// integration (see db/schema.sql). Uses the HTTP-based neon() driver rather
// than a raw TCP client since Vercel serverless functions and this driver's
// fetch-based transport are the standard pairing for Neon.
export const sql = neon(process.env.PROJECTS_DATABASE_URL);

let schemaReady;

// Runs once per warm serverless instance (cached promise) — idempotent, so
// a cold start on every instance just re-confirms the schema exists.
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
      // allWallProducts()/allColors()). Not used to filter which colors a
      // given material allows (no material_colors join table) — every
      // color remains pickable for every material/service, same as the
      // baseline catalog today.
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
    })();
  }
  return schemaReady;
}
