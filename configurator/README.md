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
  2. Full Wrap (roof + walls + soffit + fascia + gutters + downspouts) → 7% off total
  3. Gutters + Downspouts → downspouts free
- **Test house**: Rakievich Residence, Job 26-180-ER (`src/data/sample/*.xml`).
  Parsed roof/wall square footage matches the source RoofRuler reports almost
  exactly (9,394 sqft roof vs. 9,397 reported; 6,775.43 sqft wall — exact match).
  Replace it any time via **Import Roof/Wall Report XML** in the House/Project panel.
- **Real finish photos** for all three color systems (Icecrystal Relief,
  Printech Woodgrain, Wrinkle Coating) — sourced from the company's Google
  Drive color folders, used as both swatch thumbnails and tiled 3D texture
  maps (`src/data/textures/`, `src/data/colors.js`).
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
     every window/door opening (facet, type, approximate width/height/sqft)
     and every relevant line takeoff (Fascia, Gutter, Ridge, Hip, Valley,
     Gable, Apron, Step/Tuck-Under flashing) in linear feet.
  6. **Facet detail pages** — every roof slope and wall segment gets its own
     row (Facet/Product/Color/Sqft), always, not just the customized ones,
     paginating automatically as needed.
  Every report covers exactly one building. All renderings/elevations/plan
  views have their facet IDs burned directly into the image (only where
  actually visible from that angle — checked via a raycast against every
  other facet) so they read as labeled diagrams, not just pretty pictures.
  Window/door detection classifies each wall face's cutouts by the RoofRuler
  line types on their edges (`WINDOW-EDGE/HEAD/SILL` vs. `DOOR-EDGE/HEAD`);
  a door usually reaches the floor, so it shows up as a notch in the wall's
  outer boundary rather than a fully enclosed hole, and is detected
  separately by walking that boundary for contiguous door-tagged runs.
  Every capture is a static PNG baked into the PDF, not an interactive 3D
  object — see "Not yet built" below for why a truly embedded rotatable 3D
  model isn't possible.
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
  the customer-facing HTML export and shareable link). "Save As" both saves
  to the database and downloads a small HTML file to your device — the file
  is just a redirect to the project's `?p=<id>` link, not a frozen copy, so
  opening it later always loads whatever is currently saved. "Copy Project
  Link" gives the same short `?p=<id>` URL directly, by reference instead of
  embedding the whole design — this is meant to eventually anchor a rotatable 3D view linked
  from an exported PDF (see "Not yet built" below). API routes:
  `api/projects/index.js` (list, create), `api/projects/[id].js`
  (get/update/delete); schema is created automatically on first request (see
  `db/schema.sql`).

## Known simplification

Each imported layer's RoofRuler export uses its own independent local
coordinate frame (confirmed against the source files), so every layer is
centered on its own footprint and auto-stacked on top of the layers before
it by bounding-box height, rather than merged into one seamless coordinate
space. This is called out in the brief as an accepted MVP limitation ("house
geometry: simplified — proof of concept") and is surfaced in the viewer's
on-screen caption. The Layer Position Adjustment control lets you manually
nudge any one layer if the auto-stack doesn't line it up correctly.

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
