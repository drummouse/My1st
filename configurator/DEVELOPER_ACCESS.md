# Developer access

This app has two account roles:

- **`owner`** (the default — every normal signup) — full access to their own tenant's data only,
  exactly as documented everywhere else in this repo.
- **`developer`** — the same full access to their own tenant's data, *plus* the ability to
  explicitly view or manage a different tenant's data for support/debugging purposes.

There is no third "SuperAdmin" tier — `developer` is already full cross-tenant access. See
"What `developer` actually grants" below for the exact scope of what that means today.

## Granting the role

There is **no API route or UI control that grants `developer`** — this is deliberate. Promoting
an account requires direct database access, so it can never be self-service from inside the app
(no "make myself an admin" bug is possible, because there's no code path that does it).

To promote an existing account, run this once in your Neon SQL console (or any Postgres client
connected to `PROJECTS_DATABASE_URL`):

```sql
update users set role = 'developer' where email = 'you@example.com';
```

Check who currently has it:

```sql
select email, role from users where role = 'developer';
```

Demote the same way (`role = 'owner'`).

## What `developer` actually grants (and what it doesn't — yet)

A developer's **plain requests behave exactly like a normal owner's** — signing in and using the
app normally only ever shows their own data. Cross-tenant access is **always explicit, per
request**, via an `?asOwner=<userId>` query parameter on API calls:

- `GET /api/projects?asOwner=<id>` — that owner's project list instead of your own.
- `GET /api/settings?asOwner=<id>`, `PUT /api/settings?asOwner=<id>` — view/edit their Company
  Settings.
- `GET /api/custom-services?asOwner=<id>` — their custom-service catalog.
- Editing/deleting a specific row you don't own (`PUT`/`DELETE` on a project, custom service,
  color, material, folder, or attachment) also works for a developer even without `asOwner`, since
  the row's own `owner_id` already identifies the tenant.

This is implemented in `api/_lib/roles.js` (`isDeveloper`, `resolveOwnerId`, `canActOnOwner`) and
wired into `api/projects`, `api/settings`, `api/custom-services`, `api/colors`, `api/materials`,
and `api/attachments`.

**Not built yet:** there is no admin UI for browsing another tenant's data — today this is an
API-level capability only, usable via `curl`/browser devtools/a REST client while logged in as a
developer. A proper "switch tenant" UI (with a persistent on-screen indicator of whose data you're
viewing, so it's never ambiguous) is real follow-on work, not done here. Colors/materials/colors
folders' *read* access was already effectively public-by-id before this (any `?ownerId=` works
without auth, by design — see README's Materials & Colors Library section) — `developer` only
changes the *write* side for those.

## Security policy: no credentials in the repo, ever

This role exists so a **human-controlled account** — yours, or anyone else you choose to promote
— can have full access when needed. It does **not** mean creating a standing login for Claude (or
any AI agent) to use across sessions:

- There's no secure place for an agent to persist a password between sessions without writing it
  somewhere durable, and writing real credentials into the repo, a doc, or a committed `.env` file
  is a straightforward secrets-hygiene mistake regardless of who's asking for it.
- If a session genuinely needs to check something live, the practical (and safe) pattern is: you
  paste session-scoped credentials into chat for that one session, they're used and not stored,
  and you rotate the password afterward if you're not comfortable with it having been typed into a
  chat transcript at all — same guidance given earlier when an `AUTH_SECRET` value was pasted into
  this session directly.
- If standing, unattended automation against this app is actually wanted later (not just "Claude
  can check things when asked"), that's a different, larger feature: a dedicated service-account/
  API-key mechanism (its own issuance, scoping, and revocation) — not a human login shared with an
  agent. Worth scoping explicitly if/when it's actually needed.
