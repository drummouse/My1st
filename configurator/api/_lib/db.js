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
    })();
  }
  return schemaReady;
}
