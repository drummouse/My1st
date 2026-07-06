import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer3D from './components/Viewer3D.jsx';
import BrandToggle from './components/BrandToggle.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import ProductSelector from './components/ProductSelector.jsx';
import ServicesPanel from './components/ServicesPanel.jsx';
import PriceSummary from './components/PriceSummary.jsx';
import PhotoOverlayControl from './components/PhotoOverlayControl.jsx';
import AssemblyAdjustment from './components/AssemblyAdjustment.jsx';
import HouseImport from './components/HouseImport.jsx';
import FacetInspector from './components/FacetInspector.jsx';
import { parseAppliCadXML, facetKey } from './lib/roofRulerParser.js';
import { calculateEstimate } from './lib/pricingEngine.js';
import { buildEstimateText, downloadTextFile } from './lib/exportEstimate.js';
import { buildEstimatePdf } from './lib/exportPdf.js';
import { ROOF_PRODUCTS, ROOF_PROFILES, WALL_PRODUCTS, WALL_PROFILES, GUTTER_OPTIONS } from './data/pricing.js';
import { colorById } from './data/colors.js';
import { BRANDS } from './data/brands.js';
import { SAMPLE_HOUSE } from './data/sampleHouse.js';

const DEFAULT_SERVICES = {
  soffit: true,
  fascia: true,
  gutters: true,
  downspouts: true,
  snowRetention: false,
  capFlashing: false,
  garageDoorCapping: false,
};

const DEFAULT_ACCESSORY_COLORS = {
  soffit: 'wk-04',
  fascia: 'wk-04',
  gutters: 'wk-04',
  downspouts: 'wk-04',
};

const ZERO_MEASUREMENTS = {
  soffitSqft: 0,
  fasciaLf: 0,
  gutterLf: 0,
  downspoutLf: 0,
  snowRetentionLf: 0,
  capFlashingLf: 0,
  garageDoorCappingLf: 0,
};

function extractProductOverrides(overrides) {
  const result = {};
  Object.entries(overrides).forEach(([key, val]) => {
    if (val?.productId) result[key] = val.productId;
  });
  return result;
}

export default function App() {
  const [brandId, setBrandId] = useState('ironwrap');
  const [house, setHouse] = useState(SAMPLE_HOUSE);

  const [roofProductId, setRoofProductId] = useState(ROOF_PRODUCTS[0].id);
  const [roofProfile, setRoofProfile] = useState(ROOF_PROFILES[ROOF_PRODUCTS[0].id]?.[0] || '');
  const [roofColorId, setRoofColorId] = useState('wk-04'); // Graphite Grey (RAL 7024)

  const [wallProductId, setWallProductId] = useState(WALL_PRODUCTS[0].id);
  const [wallProfile, setWallProfile] = useState(WALL_PROFILES[WALL_PRODUCTS[0].id]?.[0] || '');
  const [wallColorId, setWallColorId] = useState('wk-01'); // Jet Black (Wrinkle Coating)

  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [gutterOptionId, setGutterOptionId] = useState(GUTTER_OPTIONS[0].id);
  const [measurements, setMeasurements] = useState(house.measurements);
  const [photoOverlay, setPhotoOverlay] = useState(null);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [roofOffset, setRoofOffset] = useState({ dx: 0, dy: 0, dz: 0 });
  const [accessoryColors, setAccessoryColors] = useState(DEFAULT_ACCESSORY_COLORS);
  const [viewerMode, setViewerMode] = useState('normal'); // 'normal' | 'minimized' | 'maximized'

  const [uniformFinish, setUniformFinish] = useState(true);
  const [roofOverrides, setRoofOverrides] = useState({}); // key -> { productId?, colorId? }
  const [wallOverrides, setWallOverrides] = useState({});
  const [selectedFacet, setSelectedFacet] = useState(null); // { key, faceId, role, sizeSf, pitch, orientation }

  const viewerRef = useRef(null);
  const brand = BRANDS[brandId];

  const roofParsed = useMemo(() => parseAppliCadXML(house.roofXml, 'Roof'), [house.roofXml]);
  const wallParsed = useMemo(() => parseAppliCadXML(house.wallXml, 'Wall'), [house.wallXml]);

  // Face ids are only unique within a single RoofRuler export, so imports of
  // a new house (or the sample resetting) invalidate any per-facet overrides
  // and the current selection.
  useEffect(() => {
    setRoofOverrides({});
    setWallOverrides({});
    setSelectedFacet(null);
  }, [roofParsed, wallParsed]);

  const roofFacesForPricing = useMemo(() => {
    const primary = roofParsed.faces.filter((f) => f.type === 'Roof').map((f) => ({ key: facetKey('roof', f.id), sizeSf: f.sizeSf }));
    const stray = wallParsed.faces.filter((f) => f.type === 'Roof').map((f) => ({ key: facetKey('wallxml-roof', f.id), sizeSf: f.sizeSf }));
    return [...primary, ...stray];
  }, [roofParsed, wallParsed]);

  const wallFacesForPricing = useMemo(
    () => wallParsed.faces.filter((f) => f.type === 'Wall').map((f) => ({ key: facetKey('wall', f.id), sizeSf: f.sizeSf })),
    [wallParsed]
  );

  const estimate = useMemo(
    () =>
      calculateEstimate(measurements, {
        roofProduct: roofProductId,
        wallProduct: wallProductId,
        roofFaces: roofFacesForPricing,
        wallFaces: wallFacesForPricing,
        roofOverrides: uniformFinish ? {} : extractProductOverrides(roofOverrides),
        wallOverrides: uniformFinish ? {} : extractProductOverrides(wallOverrides),
        services,
        gutterOption: gutterOptionId,
        manualDiscount,
      }),
    [measurements, roofProductId, wallProductId, roofFacesForPricing, wallFacesForPricing, uniformFinish, roofOverrides, wallOverrides, services, gutterOptionId, manualDiscount]
  );

  const roofFaceColors = useMemo(() => {
    const globalColor = colorById(roofColorId);
    const map = {};
    roofFacesForPricing.forEach(({ key }) => {
      const override = !uniformFinish && roofOverrides[key];
      map[key] = override?.colorId ? colorById(override.colorId) : globalColor;
    });
    return map;
  }, [roofFacesForPricing, roofOverrides, roofColorId, uniformFinish]);

  const wallFaceColors = useMemo(() => {
    const globalColor = colorById(wallColorId);
    const map = {};
    wallFacesForPricing.forEach(({ key }) => {
      const override = !uniformFinish && wallOverrides[key];
      map[key] = override?.colorId ? colorById(override.colorId) : globalColor;
    });
    return map;
  }, [wallFacesForPricing, wallOverrides, wallColorId, uniformFinish]);

  const handleRoofProductChange = (id) => {
    setRoofProductId(id);
    setRoofProfile(ROOF_PROFILES[id]?.[0] || '');
  };
  const handleWallProductChange = (id) => {
    setWallProductId(id);
    setWallProfile(WALL_PROFILES[id]?.[0] || '');
  };

  const handleHouseMetaChange = (patch) => setHouse((h) => ({ ...h, ...patch }));
  const handleHouseXmlImport = (kind, xmlText) => {
    setHouse((h) => ({ ...h, [kind]: xmlText }));
    setMeasurements(ZERO_MEASUREMENTS);
  };

  const handleFacetClick = (payload) => {
    if (uniformFinish) return;
    setSelectedFacet(payload);
  };

  const facetOverrideState = selectedFacet
    ? (selectedFacet.role === 'roof' ? roofOverrides : wallOverrides)[selectedFacet.key]
    : null;
  const facetGlobalProductId = selectedFacet?.role === 'roof' ? roofProductId : wallProductId;
  const facetGlobalColorId = selectedFacet?.role === 'roof' ? roofColorId : wallColorId;

  const setFacetOverride = (patch) => {
    if (!selectedFacet) return;
    const setOverrides = selectedFacet.role === 'roof' ? setRoofOverrides : setWallOverrides;
    setOverrides((prev) => ({ ...prev, [selectedFacet.key]: { ...prev[selectedFacet.key], ...patch } }));
  };

  const clearFacetOverride = () => {
    if (!selectedFacet) return;
    const setOverrides = selectedFacet.role === 'roof' ? setRoofOverrides : setWallOverrides;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedFacet.key];
      return next;
    });
  };

  const handleExportText = () => {
    const text = buildEstimateText({
      brand,
      house,
      roofProduct: ROOF_PRODUCTS.find((p) => p.id === roofProductId),
      roofColorId,
      roofProfile,
      wallProduct: WALL_PRODUCTS.find((p) => p.id === wallProductId),
      wallColorId,
      wallProfile,
      estimate,
      services,
      accessoryColors,
      uniformFinish,
      roofOverrides,
      wallOverrides,
    });
    downloadTextFile(`${house.jobNumber}-estimate.txt`, text);
  };

  const handleExportPdf = () => {
    buildEstimatePdf({
      brand,
      house,
      snapshotDataUrl: viewerRef.current?.captureSnapshot() || null,
      roofProduct: ROOF_PRODUCTS.find((p) => p.id === roofProductId),
      roofColorId,
      roofProfile,
      wallProduct: WALL_PRODUCTS.find((p) => p.id === wallProductId),
      wallColorId,
      wallProfile,
      estimate,
      services,
      accessoryColors,
      uniformFinish,
      roofOverrides,
      wallOverrides,
    });
  };

  return (
    <div className="app" style={{ '--brand-accent': brand.accent, '--brand-accent-dark': brand.accentDark }}>
      <header className="app-header">
        <div>
          <div className="app-title">{brand.name} 3D Configurator</div>
          <div className="app-subtitle">{brand.tagline} — Job {house.jobNumber} · {house.customerName}</div>
        </div>
        <BrandToggle brandId={brandId} onChange={setBrandId} />
      </header>

      <main className={`app-body${viewerMode !== 'normal' ? ` viewer-${viewerMode}` : ''}`}>
        <section className="viewer-pane">
          <div className="viewer-toolbar">
            <span className="viewer-toolbar-title">3D Model</span>
            <div className="viewer-toolbar-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewerMode(viewerMode === 'minimized' ? 'normal' : 'minimized')}
              >
                {viewerMode === 'minimized' ? 'Show 3D Model' : 'Hide'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewerMode(viewerMode === 'maximized' ? 'normal' : 'maximized')}
                disabled={viewerMode === 'minimized'}
              >
                {viewerMode === 'maximized' ? 'Restore' : 'Full Screen'}
              </button>
            </div>
          </div>

          {viewerMode !== 'minimized' && (
            <>
              <div className="viewer3d-canvas-wrap">
                <Viewer3D
                  ref={viewerRef}
                  roofParsed={roofParsed}
                  wallParsed={wallParsed}
                  roofFaceColors={roofFaceColors}
                  wallFaceColors={wallFaceColors}
                  photoOverlay={photoOverlay}
                  roofOffset={roofOffset}
                  facetSelectionEnabled={!uniformFinish}
                  selectedFacetId={selectedFacet?.key}
                  onFacetClick={handleFacetClick}
                />
                {!uniformFinish && (
                  <FacetInspector
                    facet={selectedFacet}
                    effectiveProductId={facetOverrideState?.productId || facetGlobalProductId}
                    effectiveColorId={facetOverrideState?.colorId || facetGlobalColorId}
                    hasOverride={!!facetOverrideState}
                    onProductChange={(id) => setFacetOverride({ productId: id })}
                    onColorChange={(id) => setFacetOverride({ colorId: id })}
                    onClear={clearFacetOverride}
                    onClose={() => setSelectedFacet(null)}
                  />
                )}
              </div>
              <AssemblyAdjustment
                offset={roofOffset}
                onChange={setRoofOffset}
                onReset={() => setRoofOffset({ dx: 0, dy: 0, dz: 0 })}
              />
            </>
          )}
        </section>

        <aside className="controls-pane">
          <HouseImport house={house} onMetaChange={handleHouseMetaChange} onXmlImport={handleHouseXmlImport} />

          <div className="control-block">
            <label className="uniform-toggle">
              <input type="checkbox" checked={uniformFinish} onChange={(e) => setUniformFinish(e.target.checked)} />
              <span>All roof slopes / wall segments use the same profile and color</span>
            </label>
            {!uniformFinish && (
              <div className="control-sublabel">
                Click a roof slope or wall segment in the 3D model to set its own material and color.
                {Object.keys(roofOverrides).length + Object.keys(wallOverrides).length > 0
                  ? ` ${Object.keys(roofOverrides).length + Object.keys(wallOverrides).length} facet(s) customized.`
                  : ''}
              </div>
            )}
          </div>

          <ProductSelector
            label="Roof Material"
            products={ROOF_PRODUCTS}
            profiles={ROOF_PROFILES}
            selectedId={roofProductId}
            selectedProfile={roofProfile}
            onProductChange={handleRoofProductChange}
            onProfileChange={setRoofProfile}
          />
          <ColorPicker label="Roof Color" selectedId={roofColorId} onChange={setRoofColorId} />

          <ProductSelector
            label="Siding Material"
            products={WALL_PRODUCTS}
            profiles={WALL_PROFILES}
            selectedId={wallProductId}
            selectedProfile={wallProfile}
            onProductChange={handleWallProductChange}
            onProfileChange={setWallProfile}
          />
          <ColorPicker label="Siding Color" selectedId={wallColorId} onChange={setWallColorId} />

          <ServicesPanel
            services={services}
            onServicesChange={setServices}
            measurements={measurements}
            onMeasurementsChange={setMeasurements}
            gutterOptionId={gutterOptionId}
            onGutterOptionChange={setGutterOptionId}
            accessoryColors={accessoryColors}
            onAccessoryColorsChange={setAccessoryColors}
          />

          <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />

          <PriceSummary estimate={estimate} manualDiscount={manualDiscount} onManualDiscountChange={setManualDiscount} />

          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={handleExportText}>Export Text</button>
            <button type="button" className="btn-primary" onClick={handleExportPdf}>Export PDF</button>
          </div>
        </aside>
      </main>
    </div>
  );
}
