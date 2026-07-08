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
    })();
  }
  return schemaReady;
}
