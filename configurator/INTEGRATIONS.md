# IronWrap Configurator — Integrations

This documents the app's data shapes, REST surface, and outbound events for anyone building an
automation against it (Make.com, Zapier, a custom script, etc.). It's the extension point for
future integrations — today there's exactly one outbound event (`design.approved`); adding more
later means adding another row to the Events table below and another POST call at the point in
the code where that thing happens, not building a general dispatcher up front.

## Data dictionary

### Account (`users` table / `GET /api/auth/me`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | The `owner_id` every other table's rows point at |
| `email`, `password_hash` | text | Password never leaves the server — see `api/auth/[action].js` |
| `first_name`, `last_name`, `business_name` | text | At least one of (first+last) or business_name is required at signup |
| `phone`, `address_line`, `city`, `region_code`, `postal_code` | text | Required at signup — see README's "Required account profile" |
| `website`, `social_url` | text | Optional |
| `role` | text | `'owner'` (default) or `'developer'` — see `DEVELOPER_ACCESS.md`. Never set via any API route; granted by direct database access only |

### Project (`projects` table / `GET /api/projects/:id`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Also the `?p=` shareable-link id |
| `job_number` | text | |
| `customer_name` | text | |
| `address` | text | |
| `design` | jsonb | Full design snapshot — see below |
| `owner_id` | uuid | The contractor account this project belongs to; null on projects saved before accounts existed |
| `approved_at` | timestamptz | Null until the customer clicks "Approve This Design" |
| `approved_by_name` | text | Optional name the customer typed in when approving |
| `created_at` / `updated_at` | timestamptz | |

### Design snapshot (`projects.design`, `src/lib/designState.js`)

The full state of one configured house: `brandId`, `house` (job#/customer/address/layers),
`roofProductId`/`roofColorId`/`roofProfile`, `wallProductId`/`wallColorId`/`wallProfile`,
`services` (which optional services are on), `measurements`, `manualDiscount`,
`accessoryColors`, `facetOverrides` (per-facet material/color overrides), `customServiceLines`
(resolved custom-service selections, frozen at add-time), and `pricingSettings` — the GST/tax/
discount-rule values this design was priced at, frozen the first time it's saved so a later
company-wide rate change never silently reprices an already-quoted design.

### Estimate (computed live by `src/lib/pricingEngine.js`, not stored)

`lineItems` (array of `{ key, label, qty, unit, rate, total }`), `subtotal`, `appliedDiscounts`
(array of `{ id, name, scope: 'subtotal'|'service', amount, summary }`), `manualDiscount`,
`preTaxTotal`, `baseTaxRate`, `municipalTaxRate`, `taxRate`, `taxLabel`, `taxAmount`, `total`.

### Settings (`settings` table, one row per owner)

Tax jurisdiction (`tax_country`, `tax_region`, `tax_label`, `gst_rate` as the base rate,
`municipal_tax_rate`), `discount_rules` (jsonb — see `src/lib/pricingEngine.js`'s
`buildDefaultDiscountRules` for the shape; a rule may also carry `muted: true`, which keeps it
saved/editable but excludes it from every estimate), New Project defaults (`default_services`,
`default_locked_services`, `default_accessory_colors`, `default_roof_color_id`,
`default_wall_color_id`, `default_custom_service_ids` — which of the owner's `custom_services`
catalog entries a brand-new project starts with already added), `logo_url`, `report_footer_note`,
`notification_webhook_url`.

### Custom Service (`custom_services` table)

`id`, `owner_id`, `name`, `unit` (`'sqft'|'LF'|'each'`), `price`, `description`, `link_url`.

### Material / Color (`materials` / `colors` tables)

Materials: `id`, `owner_id`, `name`, `kind` (`'roof'|'wall'`), `price_per_sqft`, `profiles`
(jsonb array of profile names). Colors: `id`, `owner_id`, `name`, `code`, `hex`, `series`,
`thumbnail_url`. Both layer on top of this app's baseline catalogs — see README's Materials &
Colors Library section.

### Attachment (`attachments` table)

`id`, `project_id`, `kind` (`'file'|'photo'`), `file_name`, `url`, `mime_type`, `size_bytes`.

## Commands (REST API surface)

All routes are under `/api`. Public routes need no session; authenticated routes require the
`ironwrap_session` cookie set by `/api/auth/login` or `/api/auth/signup`.

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/profile` | POST/POST/POST/GET/PUT | Public except `/me`, `/profile` | One user = one tenant (`owner_id`) |
| `/api/projects` | GET, POST | Authenticated | List / create; GET supports `?asOwner=<id>` for a `developer` account (see `DEVELOPER_ACCESS.md`) |
| `/api/projects/:id` | GET | **Public** | A customer opens `?p=:id` with no account |
| `/api/projects/:id` | PUT, DELETE | Authenticated | First authenticated editor claims an ownerless legacy project; a `developer` can act on any owner's project |
| `/api/projects/:id/approve` | POST | **Public** | Fires the `design.approved` event below |
| `/api/settings` | GET, PUT | Authenticated | One row per owner; PUT is a partial update (unset fields keep their existing value); supports `?asOwner=<id>` for a `developer` account |
| `/api/custom-services`, `/api/custom-services/:id` | GET/POST, PUT/DELETE | Authenticated | GET supports `?asOwner=<id>` for a `developer` account |
| `/api/colors`, `/api/colors/:id` | GET/POST, PUT/DELETE | GET is **public with `?ownerId=`**, otherwise authenticated; write is always authenticated | A `developer` account can PUT/DELETE any owner's row |
| `/api/materials`, `/api/materials/:id` | GET/POST, PUT/DELETE | Same split as colors | Same `developer` write access as colors |
| `/api/attachments?projectId=`, `/api/attachments/:id` | GET/POST, DELETE | GET is **public**; POST/DELETE require the project's owner | 15 MB/photo, 25 MB/file, 200 MB/project; a `developer` account can POST/DELETE on any owner's project |
| `/api/upload` | POST | Authenticated | Vercel Blob client-upload token endpoint; `kind` is `logo`\|`photo`\|`file` |

Each of the above is implemented as a single Vercel serverless function per resource (an optional
catch-all route dispatching on path + method internally) rather than one file per verb, to stay
under Vercel's per-deployment function-count limit — see README's "API route layout" note.

## Events (outbound)

Today there is exactly one. A general-purpose event dispatcher (subscriptions, retries, an
events log) is deliberately not built — add a row here and a POST call at the relevant point in
the code when a second event is actually needed.

| Event | Fires when | Delivery |
| --- | --- | --- |
| `design.approved` | A customer clicks "Approve This Design" on a `?p=` link (`api/projects/[[...id]].js`'s `approve` route) | POSTed as JSON to the owner's `notification_webhook_url` (Settings → Notifications), if set. Best-effort with a 5s timeout — a failing/slow webhook never changes the approval response the customer sees. |

`design.approved` payload:

```json
{
  "event": "design.approved",
  "projectId": "uuid",
  "jobNumber": "string",
  "customerName": "string",
  "address": "string",
  "approvedAt": "2026-07-11T12:00:00.000Z",
  "approvedByName": "string or null",
  "shareUrl": "https://.../?p=uuid"
}
```

Point a Make.com "Custom webhook" trigger at this URL (paste the webhook's own URL into Settings)
to build a scenario that, for example, creates a QuickBooks estimate or sends a Slack/email
notification with the full report link.
