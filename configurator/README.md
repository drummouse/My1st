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
  the same compact button showing a swatch plus the current color, instead of
  a permanently-expanded swatch grid or a plain text dropdown. Clicking it
  opens the full swatch palette (grouped by series, same picker for all six);
  picking a color closes the popover and relabels the button — `Wrinkle
  RAL 7024` / `Crystal RAL 8019` for the two RAL-coded finishes, or just the
  name (e.g. `Rustic Wenge`) for Printech Woodgrain, which has no RAL code.
  Positioned via a fixed-position rect computed from the button itself so it
  floats above the scrollable sidebar instead of being clipped by it. All
  three series are expanded by default (no accordion click needed to see the
  full palette), and the popover is sized to comfortably fit all of them.
  For Roof/Siding specifically, when per-facet overrides mean not every
  facet shares the same effective color, the button reads "Various Colors"
  (with a checkered swatch) instead of showing one facet's color as if it
  were the color for the whole roof/wall.
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
- **Export HTML** — downloads a single self-contained interactive file
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
- **Shareable design link** — "Copy Shareable Link" encodes the whole design
  (gzip-compressed, base64url) directly into a `?d=` URL param — no backend,
  works even if any third-party service is down. Same locked-down
  presenter/viewer behavior as the HTML export. (`src/lib/designState.js`)
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
  current Job #/Customer for now, not yet independently editable (planned
  for a future Settings panel), which also means it can't go stale: it's
  never a separate piece of state to forget to reset. "Copy Project Link"
  gives the same short `?p=<id>` URL directly, by reference instead of
  embedding the whole design — this is meant to eventually anchor a rotatable
  3D view linked from an exported PDF (see "Not yet built" below). API
  routes: `api/projects/index.js` (list, create), `api/projects/[id].js`
  (get/update/delete); schema is created automatically on first request (see
  `db/schema.sql`). The saved-projects list below the buttons is capped at a
  fixed height and scrolls internally once it grows past a handful of
  entries, instead of stretching the whole sidebar taller as more get saved.

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
  stays a static screenshot + full facet report, with Export HTML and the
  shareable link as the two genuinely rotatable options. A clickable
  link/QR code in the PDF pointing to the live rotatable view is the
  next-best alternative, on request — now that Projects gives every design a
  stable short `?p=<id>` URL, that link is a natural fit for this, but it
  hasn't been wired into `exportPdf.js` yet.
- Projects database (`db/schema.sql`, `api/projects/*`) is built but not yet
  live-tested end-to-end: this sandbox's network egress allowlist blocks the
  Neon HTTP endpoint (`*.neon.tech`), so it's untested against a running
  database — pending the environment's network allowance being added
  (desktop-only setting) and a fresh session.
