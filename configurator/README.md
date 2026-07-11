# IronWrap 3D Configurator (MVP)

Contractor-owned, real-time 3D roofing & siding configurator. React 18 + Three.js.

## What's here

- **RoofRuler/AppliCAD XML parser** (`src/lib/roofRulerParser.js`) — parses real
  RoofRuler exports (`POINT`/`LINE`/`FACE` elements), resolving line chains into
  ordered vertex loops and handling multi-loop faces (window/door cutouts via
  the `L0` loop separator).
- **Triangulation** (`src/lib/buildGeometry.js`) — projects each planar face
  (with holes) into 2D and triangulates with `THREE.ShapeUtils`, so concave
  facets and window/door cutouts render correctly.
- **3D viewer** (`src/components/Viewer3D.jsx`) — orbit/zoom/pan, live
  material recoloring without a full scene rebuild.
- **Pricing engine** (`src/lib/pricingEngine.js`) — real QuickBooks pricing
  (see `src/data/pricing.js`, sourced from `BookIPI_Items_QuickBooks_Import.csv`)
  and the three package-deal rules from the project brief:
  1. Soffit + Fascia → 50% off fascia
  2. Full Wrap (roof + walls + soffit + fascia + gutters + downspouts) → 7% off
     total — requires actual roof AND wall material being estimated (nonzero
     totals), not just the four accessory checkboxes, so a roof-only project
     (no wall layer imported) never qualifies no matter what's checked
  3. Gutters + Downspouts → downspouts free

  Only line items with a nonzero quantity are shown in the Estimate Summary
  and PDF/text export — an unselected accessory or a material with no
  matching layer imported (e.g. "Siding" with no wall XML loaded) doesn't
  clutter the breakdown with a $0 row. A package-deal line discounted to $0
  (e.g. "Downspouts ... FREE") still shows, since its quantity is real.
- **Test house**: Rakievich Residence, Job 26-180-ER (`src/data/sample/*.xml`).
  Parsed roof/wall square footage matches the source RoofRuler reports almost
  exactly (9,394 sqft roof vs. 9,397 reported; 6,775.43 sqft wall — exact match).
  Replace it any time via **Import Roof/Wall Report XML** in the House/Project panel.
- **Real finish photos** for all three color systems (Icecrystal Relief,
  Printech Woodgrain, Wrinkle Coating) — sourced from the company's Google
  Drive color folders, used as both swatch thumbnails and tiled 3D texture
  maps (`src/data/textures/`, `src/data/colors.js`).
- **Color picker button** (`src/components/ColorPickerButton.jsx`) — every
  colorable component (Roof, Siding, Soffit, Fascia, Gutters, Downspouts) gets
  the same compact trigger button showing a swatch plus the current color;
  picking a color relabels it — `Wrinkle RAL 7024` / `Crystal RAL 8019` for
  the two RAL-coded finishes, or just the name (e.g. `Rustic Wenge`) for
  Printech Woodgrain, which has no RAL code. What opens on click is
  responsive, not a single shared popover: on a fine pointer (desktop/laptop)
  it's a centered **Sample Board** modal — series-as-tabs, a grid of larger
  tactile cards (photo swatch + name + code), sized for browsing with a
  customer in the room; on a coarse pointer at narrow widths (phone/tablet,
  same signal `AssemblyAdjustment.jsx`'s Position dock uses) it's a **Quick
  Drawer** bottom sheet — a search box plus series accordions collapsed by
  default, sized for one-thumb scrolling in the field. Both are docked/centered
  rather than anchored-and-positioned off the trigger button, which sidesteps
  the viewport-collision bug class entirely (a popover positioned from
  `getBoundingClientRect()` with no flip/clamp logic could previously push
  part of itself off-screen with no way to reach it — fixed once, then
  designed around for good in this rewrite). For Roof/Siding specifically,
  when per-facet overrides mean not every facet shares the same effective
  color, the button reads "Various Colors" (with a checkered swatch) instead
  of showing one facet's color as if it were the color for the whole
  roof/wall.
- **Downspouts** are their own independent product selector (`Downspout
  type`), matching the three real QuickBooks line items — 3" Round, 4" Round,
  3x3 Square — instead of being implicitly tied to whichever gutter profile
  was selected.
- **Roof and Wall are optional services too** (`services.roof`/`services.wall`),
  same checkbox + admin Lock pattern as Soffit/Fascia/Gutters/Downspouts —
  unchecking one drops it from the price breakdown (and the Selections list)
  entirely, e.g. for an estimate covering only siding work with no roofing.
  Full Wrap requires both to be included (and actually priced — nonzero
  totals) in addition to the four accessory services.
- **Per-facet customization** — every roof slope and wall segment is its own
  mesh (`src/lib/buildScene.js`) so it can be clicked in the 3D viewer and
  given its own material/color, overriding the global selection. Governed by
  an "all same" checkbox (default on); `pricingEngine.js` groups facets by
  their effective product so the price breakdown reflects any per-facet
  material changes.
- **PDF & text export** (`src/lib/exportPdf.js`, `src/lib/exportEstimate.js`,
  `src/lib/roofRulerParser.js`) — a structured, multi-page report modeled on
  the company's existing RoofRuler Wall/Roof Reports:
  1. **Cover page** — branding, job number, customer, address, date prepared.
  2. **Renderings & Estimate Summary** — four auto-captured isometric
     screenshots of the 3D model (one from each diagonal corner, framed
     tight enough that the model fills the frame, angled slightly above
     ground to read the roof), stacked down the left half of the page, next
     to a Selections list and the full Materials/Services price breakdown
     (Subtotal, package discounts, GST, Total) on the right half.
  3. **Elevations** — four true-to-scale orthographic views (Front/Right/
     Back/Left, relative to the model — the XML carries no compass bearing),
     one per quadrant of the page.
  4. **Roof Plan** — a single top-down orthographic view of the roof.
  5. **Window & Door Schedule** and **Linear Footage & Accessories
     Takeoff** — soffit, fascia, gutters, and downspouts aren't modeled as
     their own 3D geometry (only as linear-footage line items), so instead of
     a fabricated "view" of them, these tables report the actual measurements:
     every opening (ID, wall facet, type, approximate width/height/sqft) and
     every relevant line takeoff (Fascia, Gutter, Ridge, Hip, Valley, Gable,
     Apron, Step/Tuck-Under flashing) in linear feet.
  6. **Facet detail pages** — every roof slope and wall segment gets its own
     row (Facet/Product/Color/Sqft), always, not just the customized ones,
     paginating automatically as needed.
  Every report covers exactly one building. Every facet and opening gets a
  clean, collision-free label (`src/lib/facetLabels.js`) instead of the raw
  RoofRuler face id (which can collide between a roof export and a wall
  export): **R1, R2...** for roof slopes, **F1, F2...** for wall segments,
  **W1, W2...** for windows, **D1, D2...** for doors, **O1, O2...** for any
  other opening/penetration that isn't tagged as either (previously silently
  dropped — now a real, labeled row). Only the **Roof Plan** burns these
  labels into the image itself (only where a facet is actually visible from
  directly above, checked via a raycast against every other facet); the
  isometric renderings and elevations are intentionally left unlabeled —
  clean "wow" shots and true-to-scale elevation drawings, not diagrams. The
  Window & Door Schedule and the Roof Slopes/Wall Segments tables use the
  same labels, so a reader can cross-reference an opening or facet between
  the plan drawing and the tables. Window/door/other detection classifies
  each wall face's cutouts by the RoofRuler line types on their edges
  (`WINDOW-EDGE/HEAD/SILL` vs. `DOOR-EDGE/HEAD`, falling back to "other" for
  anything untagged); a door usually reaches the floor, so it shows up as a
  notch in the wall's outer boundary rather than a fully enclosed hole, and
  is detected separately by walking that boundary for contiguous
  door-tagged runs. Every capture is a static PNG baked into the PDF, not an
  interactive 3D object — see "Not yet built" below for why a truly embedded
  rotatable 3D model isn't possible.
- **Share Design** — downloads a single self-contained interactive HTML file
  (`vite.artifact.config.js` build, inlined via
  `scripts/build-snapshot-template.mjs`) with the current design loaded in.
  Still fully explorable — rotate the 3D view, try other colors/profiles/
  materials, check/uncheck which optional services are included — but it's a
  presenter/viewer for a customer, not an editor: the manual/override
  discount field, every quantity that feeds the subtotal (sqft/LF
  measurements, eavestrough profile — but not the service on/off checkboxes
  themselves, which stay interactive by default), the Layers panel's
  structure (visibility, rename, remove, import), the entire Projects panel
  (no loading a different saved project), and the whole export/share button
  row itself (no re-exporting or generating a new link from an already-
  exported file) are all locked/hidden. Automatic package-deal discounts
  still recalculate live as services are toggled.
  Per-service **Lock** checkboxes in the admin's Optional Services panel
  freeze a specific service's on/off state for customer-facing views (e.g.
  lock Fascia always-included) while every other, unlocked service stays
  toggleable by the client — `lockedServices` travels with the design the
  same way `services` does.
- **Legacy `?d=` design links** — the "Copy Shareable Link" button was
  removed, but previously copied links (whole design gzip-encoded into the
  URL) still decode and open in the same locked-down presenter/viewer mode
  as the HTML export. (`src/lib/designState.js`)
- **Layers** — import any number of RoofRuler/AppliCAD XML reports (roof,
  wall, a garage roof, a second building, anything); each import becomes its
  own layer with a visibility checkbox, an editable name, and a remove
  button (`src/components/LayersPanel.jsx`). Every facet is keyed by
  `layerId:faceId` (`facetKey()`, generalized from the original fixed
  roof/wall tags), so per-facet material/color overrides, pricing, and
  export reporting all aggregate across however many layers are loaded,
  bucketed by each facet's own `type` (Roof/Wall) rather than by which file
  it came from.
- **Projects (save/load/edit)** — the whole design state (job #, customer,
  address, layers, product/color selections, overrides, everything
  `designState.js` captures) can be saved to a Postgres database (Neon, via
  Vercel's marketplace integration and the HTTP-based
  `@neondatabase/serverless` driver) and reopened, updated, or deleted later
  from the **Projects** panel (admin/internal use only — hidden entirely in
  the customer-facing HTML export and shareable link). A single
  **Download** button both saves to the database and downloads a small
  pointer HTML file to your device — a redirect to the project's `?p=<id>`
  link, not a frozen copy, so opening it later always loads whatever is
  currently saved. It's an upsert: once a design has been saved, clicking
  Download again updates that same record instead of creating a duplicate —
  only **+ New Project** (top of the House/Project panel; resets job #,
  customer, address, layers, and every selection/override back to blank, so
  nothing from the previous design can leak into the next one) clears the
  saved-project link and starts a genuinely new record. A **Project Name**
  field under the Download button shows `JOB_NUMBER - CUSTOMER - DATE`
  (also used as the downloaded file's name) — purely derived from the
  current Job #/Customer for now, not yet independently editable. "Copy
  Project Link" gives the same short `?p=<id>` URL directly, by reference
  instead of embedding the whole design — this now also anchors the PDF's
  cover-page QR code (see below). API routes: `api/projects/index.js` (list,
  create), `api/projects/[id].js` (get/update/delete); schema is created
  automatically on first request (see `db/schema.sql`). The saved-projects
  list below the buttons is capped at a fixed height and scrolls internally
  once it grows past a handful of entries, instead of stretching the whole
  sidebar taller as more get saved.
- **Accounts** (`src/components/AuthGate.jsx`, `api/auth/*`, `api/_lib/auth.js`) —
  simple email+password login gates the bare app URL (an admin/salesperson's
  own workspace); one signed-up user is one tenant boundary (`owner_id`),
  no shared multi-seat company accounts in v1. Sessions are a signed JWT in
  an httpOnly cookie (`jose` + `bcryptjs`, no server-side session table —
  fits a stateless serverless deploy). Critically, the three customer-facing
  entry points (`?p=<id>` project link, the legacy `?d=` link, and an opened
  Share Design HTML export) all bypass the login gate entirely — a customer
  viewing a shared design never needs an account — detected directly via
  `window.__IRONWRAP_DESIGN__` / the URL's query params rather than app
  state, since that state hasn't committed yet this early in the mount.
  `projects` and `settings` rows now carry `owner_id`; the public single-project
  `GET api/projects/[id].js` and the approve route stay unauthenticated,
  everything else (list/create/update/delete, all of Settings) requires the
  session cookie. A project saved before accounts existed (`owner_id` null)
  is auto-claimed by whichever authenticated user edits it first, rather than
  becoming permanently unownable.
- **Nav bar** (`NAV_SECTIONS` in `App.jsx`, admin-only — hidden in customer
  view) — a thin tab strip under the header switching which section renders
  (`Configurator`, today's main view, is the default); more tabs land here
  as their features ship (Custom Services, Materials). Not a router — just a
  plain `activeSection` state toggle. Switching away from
  Configurator hides it with `display: none` rather than unmounting it, so
  the 3D viewer (expensive to tear down/rebuild) survives a trip to Settings
  and back; contrast with the deliberate "Hide 3D Model" toolbar button,
  which does fully unmount it.
- **Company Settings** (`src/components/SettingsPanel.jsx`, its own nav
  section) — tax jurisdiction, New Project's default services/locks/colors, a
  company logo, and a PDF footer note. Stored in a `settings` table
  (`api/settings/index.js`) with one row per owner — deliberately separate
  from the per-project `design` JSONB in `projects` since these apply across
  every project for that account, not to one design. `src/lib/pricingEngine.js`'s
  `calculateEstimate` accepts each rate as an optional override
  (`selections.gstRate` etc.) and falls back to today's hardcoded values when
  Settings hasn't loaded or been changed yet, so nothing changes until an
  admin actually edits something. If the Settings database isn't reachable,
  the panel still opens and shows today's defaults read-only-in-effect,
  rather than getting stuck.
  Since Settings is per-owner and admin-editable, a saved/shared design
  freezes the rates it was quoted at into its own snapshot
  (`pricingSettings` in `src/lib/designState.js`) the first time it's saved —
  a customer reopening an already-shared link always sees the numbers they
  were actually quoted, never a price that's silently moved because the
  owner has since changed their company-wide tax rate or discount rules. A
  brand-new, never-saved project still tracks live Settings until that first
  save freezes it.
- **Tax model** (`src/data/taxRates.js`, Settings → Tax) — a static, researched
  table of base sales-tax rates for all 13 Canadian provinces/territories
  (GST-only, GST+PST/RST, or HST depending on province) and all 50 US states
  + DC (no US federal sales tax — state rate only, 0% in five states).
  Picking a Country/Province-State in Settings prefills the base rate and a
  display label (GST/HST/State/...) from this table, both still fully
  editable afterward — the table is a starting default, not an authority.
  An additional, always-editable **Municipal / local tax** field covers
  county/city add-ons the static table can't know about (mainly a US
  concern). `pricingEngine.js` sums base + municipal into one effective
  `taxRate` applied exactly where the old hardcoded GST rate used to be — no
  new call sites, just what feeds that one number. The combined rate and its
  label freeze into `pricingSettings` the same way the discount rules below
  do.
- **Generalized discount rules** (`src/components/DiscountsPanel.jsx`, its
  own nav section) — the three package deals (Full Wrap 7% off everything;
  Soffit+Fascia 50% off Fascia; Gutters+Downspouts frees Downspouts) used to
  be hardcoded conditionals in `pricingEngine.js`. They're now data: a
  `discount_rules` jsonb column on `settings`, each rule shaped
  `{ id, name, appliesToServices, requireAll, effect }` where `effect` is
  either `{ type: 'percent', value }` (no `serviceKey` — percent off the
  *whole* pre-discount subtotal) or `{ type: 'percent'|'free', value?,
  serviceKey }` (applies to one line item only). `calculateEstimate` matches
  rules against which services are actually active (roof/wall count as
  active only when they have real priced square footage, not just a checked
  box — matching the old Full Wrap logic exactly), and a matching
  whole-estimate rule always wins outright over narrower ones, same as
  before. A `null` `discount_rules` column (every row created before this
  feature, or never edited in the Discounts panel) means "not customized
  yet" — `buildDefaultDiscountRules()` seeds the same three rules from the
  legacy `full_wrap_discount_pct`/`soffit_fascia_discount_pct`/
  `gutter_downspout_free` columns in that case, so pricing is byte-identical
  to the old hardcoded math until an admin actually adds/edits a rule. Those
  three legacy columns are left in place (this codebase never does
  destructive migrations) purely as that fallback's source values.
  Settings and Discounts are separate panels that each `PUT` only the fields
  they show; `api/settings/index.js`'s update writes every column with
  `coalesce(excluded.x, settings.x)` so one panel's save never blanks out a
  field only the other panel manages.
- **Custom Services** (`src/components/CustomServicesPanel.jsx`, its own nav
  section) — a per-owner catalog (`custom_services` table:
  name/unit/price/description/link) of extra services beyond the fixed
  Roof/Wall/Soffit/... set, for one-off items that don't warrant their own
  hardcoded pricing row. Adding one to a project (from the "Add a custom
  service" picker at the bottom of Optional Services) copies its
  name/price/unit/description/link into that project's own
  `customServiceLines` at add-time — a project keeps pricing at whatever it
  was quoted even if the owner later edits or deletes that catalog entry,
  the same "frozen at save/add time" spirit as `pricingSettings`.
  `pricingEngine.js` turns each line with a qty > 0 into an ordinary
  `qty * price` line item (not matched against `discountRules` — those only
  ever look at the fixed service keys); `exportEstimate.js`/`exportPdf.js`/
  `PriceSummary.jsx` all print a line's `description`/`linkUrl` when
  present, the same way custom services are shown in the live HTML view.
- **Materials & Colors Library** (`src/components/MaterialsPanel.jsx`, its
  own "Materials" nav section) — per-owner `colors` and `materials` tables
  layered on top of the app's baseline catalogs (`RAL_COLORS` in
  `src/data/colors.js`; `ROOF_PRODUCTS`/`WALL_PRODUCTS` in
  `src/data/pricing.js`). Rather than thread a merged list through every
  component that reads those catalogs (`ColorPickerButton`, `ProductSelector`,
  `FacetInspector`, `pricingEngine.js`, the PDF/text exporters), both data
  modules expose a small mutable registry — `setExtraColors()`/
  `allColors()` and `setExtraMaterials()`/`allRoofProducts()`/
  `allWallProducts()` — that App.jsx populates once from a fetch, after
  which every existing `colorById()`/product-lookup call site picks up
  custom entries automatically with no changes to how it's called.
  Deliberately no `material_colors` join table restricting which colors
  apply to which material — every color stays pickable everywhere, same as
  the baseline catalog today; a future Scanner-tool import is still free to
  populate `materials`/`colors` directly, join table or not.
  `GET /api/colors`/`GET /api/materials` serve two audiences from one route:
  called with an `ownerId` query param they're public (a customer viewing a
  `?p=` link passes that already-public project's `owner_id` to see the same
  custom entries its owner added, no login needed); called with no
  `ownerId` they require a session and return the caller's own rows (used by
  the Materials panel itself). Create/update/delete stay authenticated-only.
- **Library folders + material↔color linking** — a `folders` table (one
  self-referencing tree per `kind`, `'material'` or `'color'`) organizes both
  libraries into named groups (e.g. Materials → Roofing/Siding; Colors → a
  color-line name), and two join tables capture real many-to-many
  relationships: `color_folders` (a color can sit in more than one folder —
  the same finish listed under two different manufacturers' color-line
  folders) and `material_colors` (which colors are "applicable" to a
  material, edited from that material's row in `MaterialsPanel.jsx`). This
  all lives inside the existing `api/colors/[[...id]].js`/
  `api/materials/[[...id]].js` routes via a `?folders=1` query param (folder
  CRUD) and `?colors=1` on a material's URL (replace its linked colors) —
  no new route files, keeping the function count where the "API route
  layout" note above left it. The baseline catalogs stay ungrouped by this
  system (no folders, no material_colors rows) — it only organizes the
  owner-added layer. `ColorPickerButton.jsx` reads an optional
  `allowedColorIds` prop (`App.jsx` derives it from the selected roof/wall
  material's linked colors); a material with zero linked colors — the
  default until an admin actually sets some — shows the full merged catalog
  exactly as before, so existing projects never lose color choices out from
  under them.
- **Attachments** (`src/components/AttachmentsPanel.jsx`, shown under
  Projects once a project has been saved) — an `attachments` table
  (`project_id`, `kind` 'file'|'photo', `file_name`, `url`, `mime_type`,
  `size_bytes`) with two upload paths sharing `api/upload.js`'s existing
  `photo`/`file` Blob kinds (15 MB/photo, 25 MB/file, enforced again
  server-side in `api/attachments/[[...id]].js` along with a 200 MB
  per-project aggregate cap). **Attach File** always renders as a link —
  jsPDF can't embed another PDF anyway, and it keeps report generation time
  and size predictable regardless of file count. **Attach Photo** embeds a
  small thumbnail directly in the PDF's own "Attachments" page (via
  `urlToDataUrl`, the same fetch-to-data-URL step already used for the
  company logo) alongside a link to the full-resolution original — never
  the full-size image inline. The list route is deliberately public
  (`GET /api/attachments?projectId=`) so a customer viewing a `?p=` link
  sees the same attachments with no login, matching how the project itself
  is public; add/remove require the project's owner.
- **API route layout** — every `api/*` route is one Vercel serverless
  function, and the Hobby plan caps how many a single project can deploy.
  Rather than one file per resource-and-verb (`projects/index.js`,
  `projects/[id].js`, `projects/[id]/approve.js`, ...), each resource is a
  single file using an optional catch-all path (`projects/[[...id]].js`,
  `colors/[[...id]].js`, etc.) that dispatches on the path segments and
  `req.method` internally — same routes/URLs from the browser's point of
  view, far fewer functions. `auth/[action].js` does the same for
  signup/login/logout/me. Keep new API surface inside these existing files
  (or follow the same pattern for a genuinely new resource) rather than
  adding another top-level route file.
- **Company logo** (Settings → Company Logo) — uploads via `@vercel/blob`'s
  client-side direct-upload path (the browser uploads straight to Blob
  storage with a signed token from `api/upload.js`, bypassing Vercel's
  serverless function body-size limit) rather than through a server route
  handling the file itself. `api/upload.js` is written as one shared route
  for every Blob-backed upload in the app — the caller passes a `kind`
  (`logo` now; `photo`/`file` planned for project attachments) and the route
  enforces that kind's own content-type/size limit (5 MB, PNG/JPEG/WebP/SVG,
  for a logo), so a future looser limit on one kind can't be used to bypass
  a stricter one on another. Shown in the app header and drawn on the PDF
  cover page (`drawCoverPage` in `exportPdf.js`, fit within a fixed box
  preserving the logo's own aspect ratio via `doc.getImageProperties`) —
  `handleExportPdf` fetches the stored logo URL and converts it to a data
  URL first (`src/lib/fileUtils.js`'s `urlToDataUrl`, also the landing spot
  for the same conversion once Photo attachments need embedded thumbnails),
  since jsPDF's `addImage` needs an already-loaded image, not a remote URL.
- **QR code on the PDF cover page** — when the current design has been saved
  as a Project (`currentProjectId` is set), `handleExportPdf` generates a QR
  (via the `qrcode` package) encoding that project's `?p=<id>` URL and
  `drawCoverPage` in `exportPdf.js` draws it in the previously-unused space
  below the info card, captioned "Scan for a live, rotatable 3D view". A
  brand-new, never-saved design simply gets today's PDF with no QR block —
  exporting never forces a save as a side effect.
- **Customer "Approve This Design"** — shown only in customer view on a real
  saved-project link (`isCustomerView && currentProjectId`; not on the
  legacy `?d=` link or the Share Design HTML export, which have no project
  id to attach an approval to). Posts to `api/projects/[id]/approve.js`,
  which stamps `approved_at`/`approved_by_name` on that project's row; once
  approved, the button is replaced with "Approved on `<date>`" and stays
  that way on every future visit to the same link.

- **Required account profile** (`AuthGate.jsx`'s signup form; editable later from
  Settings → Company Profile) — every account now requires either a first+last name or a
  business name (at least one), a phone number, and a full address (street, city,
  province/state, postal/zip). Postal/zip auto-reformats from however it's typed
  (`src/lib/address.js`'s `formatPostalOrZip` — Canadian → `A0A 0A0`, US → `12345` or
  `12345-6789`) on blur. Province/state reuses the same `COUNTRIES`/`REGIONS` picker already
  built for Settings → Tax, and signup auto-seeds that new owner's first `settings` row's tax
  fields from the address given (still fully editable afterward) instead of defaulting to
  Alberta's rate. Website and a social link are optional — the one place that actually matters
  ("hide if blank") is the PDF cover page, which prints a phone/address/website/social contact
  line only for whichever of those are actually set. Profile fields live on `users` (not
  `settings`) and are edited via a dedicated `profile` action on `api/auth/[action].js`, kept
  separate from the Settings save flow since it's identity/contact info, not a business setting.
- **Developer role** — every account is `owner` by default (full access to only their own tenant,
  as everywhere else in this doc). A `developer` role exists for cross-tenant support/debugging
  access, granted only via direct database access (never through the app itself) — see
  `DEVELOPER_ACCESS.md` for how to grant it, what it does and doesn't currently unlock, and the
  security policy around not storing real credentials anywhere in this repo.

## Known simplification

Each imported layer's RoofRuler export uses its own independent local
coordinate frame (confirmed against the source files), so every layer is
centered on its own footprint and auto-stacked on top of the layers before
it by bounding-box height, rather than merged into one seamless coordinate
space. This is called out in the brief as an accepted MVP limitation ("house
geometry: simplified — proof of concept") and is surfaced in the viewer's
on-screen caption. The **Position** control lets you manually nudge any one
layer if the auto-stack doesn't line it up correctly — docked as a small
overlay in the 3D view's bottom-left corner (`src/components/AssemblyAdjustment.jsx`)
rather than a full-width panel, so it never crowds out the model itself.
On a fine pointer (mouse/trackpad) it stays open with compact sliders; on a
coarse pointer (touch) it starts collapsed to just its toggle and, once
opened, swaps the sliders for tap-friendly +/- step buttons instead — no
custom drag gesture to conflict with the 3D view's own single-finger-rotate /
two-finger-zoom touch handling.

- **Auto-updating PWA** (`src/main.jsx`) — the app installs a service worker
  (`vite-plugin-pwa`) for offline/installable use, but a plain registration
  can leave an already-open tab running a stale cached bundle even after a
  new deploy. `registerSW({ immediate: true, onRegisteredSW, onNeedRefresh })`
  checks for a new deploy every 60 seconds and reloads automatically the
  moment one's found, so a redeploy always reaches whatever's already open,
  not just new tabs.

## Run it

```bash
cd configurator
npm install
npm run dev       # http://localhost:5173
npm run build      # production build to dist/
```

## Not yet built (Phase 2, per brief)

- Live QuickBooks pricing via Make.com — the Make.com/QuickBooks/Claude
  agent side of this (separate from the configurator app) is built and the
  read tools are verified live; wiring it into the configurator's own
  pricing engine hasn't been started
- JobNimbus push
- Real profile (rib/panel) geometry — "profile" selectors are currently
  visual-only labels; actual rib spacing/geometry needs the supplier profile
  spec sheets (Eastside siding, Schlebach/NewTech roofing, gutter profiles)
- A rotatable **locked** 3D model embedded directly in the PDF (as opposed
  to a flat screenshot) — investigated; the only vendor built for this
  (PDF3D) shut down in 2023, and no free/open path exists to convert a
  Three.js scene to the required U3D/PRC format. Current fallback: the PDF
  stays a static screenshot + full facet report, with Share Design (HTML
  export) as the genuinely rotatable option, plus a QR code on the cover
  page (see below) linking straight to the live `?p=<id>` view when the
  project has been saved.
- Projects database (`db/schema.sql`, `api/projects/*`) is built but not yet
  live-tested end-to-end: this sandbox's network egress allowlist blocks the
  Neon HTTP endpoint (`*.neon.tech`), so it's untested against a running
  database — pending the environment's network allowance being added
  (desktop-only setting) and a fresh session.
