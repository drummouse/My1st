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

## Known simplification

The roof and wall RoofRuler exports use independent local coordinate frames
(confirmed against the source files), so the two structures are centered on
their own footprints and stacked by bounding-box height rather than merged
into one seamless coordinate space. This is called out in the brief as an
accepted MVP limitation ("house geometry: simplified — proof of concept") and
is surfaced in the viewer's on-screen caption.

## Run it

```bash
cd configurator
npm install
npm run dev       # http://localhost:5173
npm run build      # production build to dist/
```

## Not yet built (Phase 2, per brief)

- Live QuickBooks pricing via Make.com (currently hardcoded)
- JobNimbus push
- PDF export (currently a downloadable text summary)
- Shareable design links
- 26-color RAL/woodgrain palette (currently a 12-color starter RAL set —
  swap in the full supplier swatch list when available)
