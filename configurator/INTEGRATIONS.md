# IronWrap Configurator — Integrations

This documents the app's data shapes, REST surface, and outbound events for anyone building an
automation against it (Make.com, Zapier, a custom script, etc.). It's the extension point for
future integrations — today there's exactly one outbound event (`design.approved`); adding more
later means adding another row to the Events table below and another POST call at the point in
the code where that thing happens, not building a general dispatcher up front.

## Data dictionary

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
`buildDefaultDiscountRules` for the shape), New Project defaults (`default_services`,
`default_locked_services`, `default_accessory_colors`, `default_roof_color_id`,
`default_wall_color_id`), `logo_url`, `report_footer_note`, `notification_webhook_url`.

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
| `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | POST/POST/POST/GET | Public | One user = one tenant (`owner_id`) |
| `/api/projects` | GET, POST | Authenticated | List / create this owner's projects |
| `/api/projects/:id` | GET | **Public** | A customer opens `?p=:id` with no account |
| `/api/projects/:id` | PUT, DELETE | Authenticated | First authenticated editor claims an ownerless legacy project |
| `/api/projects/:id/approve` | POST | **Public** | Fires the `design.approved` event below |
| `/api/settings` | GET, PUT | Authenticated | One row per owner; PUT is a partial update (unset fields keep their existing value) |
| `/api/custom-services`, `/api/custom-services/:id` | GET/POST, PUT/DELETE | Authenticated | |
| `/api/colors`, `/api/colors/:id` | GET/POST, PUT/DELETE | GET is **public with `?ownerId=`**, otherwise authenticated; write is always authenticated | |
| `/api/materials`, `/api/materials/:id` | GET/POST, PUT/DELETE | Same split as colors | |
| `/api/attachments?projectId=`, `/api/attachments/:id` | GET/POST, DELETE | GET is **public**; POST/DELETE require the project's owner | 15 MB/photo, 25 MB/file, 200 MB/project |
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
