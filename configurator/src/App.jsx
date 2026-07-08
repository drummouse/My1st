import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer3D from './components/Viewer3D.jsx';
import BrandToggle from './components/BrandToggle.jsx';
import ColorPickerButton from './components/ColorPickerButton.jsx';
import ProductSelector from './components/ProductSelector.jsx';
import ServicesPanel from './components/ServicesPanel.jsx';
import PriceSummary from './components/PriceSummary.jsx';
import PhotoOverlayControl from './components/PhotoOverlayControl.jsx';
import AssemblyAdjustment from './components/AssemblyAdjustment.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import ProjectsPanel from './components/ProjectsPanel.jsx';
import FacetInspector from './components/FacetInspector.jsx';
import { parseAppliCadXML, facetKey, collectOpenings } from './lib/roofRulerParser.js';
import { calculateEstimate } from './lib/pricingEngine.js';
import { buildEstimateText, downloadTextFile } from './lib/exportEstimate.js';
import { buildEstimatePdf } from './lib/exportPdf.js';
import { captureDesignState, applyDesignState, encodeDesignForUrl, decodeDesignFromUrl } from './lib/designState.js';
import { ROOF_PRODUCTS, ROOF_PROFILES, WALL_PRODUCTS, WALL_PROFILES, GUTTER_OPTIONS, DOWNSPOUT_OPTIONS } from './data/pricing.js';
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

// Admin-only: which optional services the client can't opt out of when
// viewing an HTML export / shareable link / project link. Locking a service
// freezes its current checked state in customer view rather than forcing it
// on — an admin can still lock a service off, if that's ever useful.
const DEFAULT_LOCKED_SERVICES = {
  soffit: false,
  fascia: false,
  gutters: false,
  downspouts: false,
  snowRetention: false,
  capFlashing: false,
  garageDoorCapping: false,
};

const BLANK_HOUSE = {
  jobNumber: '',
  customerName: '',
  address: '',
  layers: [],
  measurements: {
    soffitSqft: 0,
    fasciaLf: 0,
    gutterLf: 0,
    downspoutLf: 0,
    snowRetentionLf: 0,
    capFlashingLf: 0,
    garageDoorCappingLf: 0,
  },
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
  const [lockedServices, setLockedServices] = useState(DEFAULT_LOCKED_SERVICES);
  const [gutterOptionId, setGutterOptionId] = useState(GUTTER_OPTIONS[0].id);
  const [downspoutOptionId, setDownspoutOptionId] = useState(DOWNSPOUT_OPTIONS[0].id);
  const [measurements, setMeasurements] = useState(house.measurements);
  const [photoOverlay, setPhotoOverlay] = useState(null);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [layerOffsets, setLayerOffsets] = useState({}); // layerId -> { dx, dy, dz }
  const [activeLayerId, setActiveLayerId] = useState(house.layers[0]?.id);
  const [accessoryColors, setAccessoryColors] = useState(DEFAULT_ACCESSORY_COLORS);
  const [viewerMode, setViewerMode] = useState('normal'); // 'normal' | 'minimized' | 'maximized'
  const [shareStatus, setShareStatus] = useState('');

  const [uniformFinish, setUniformFinish] = useState(true);
  const [facetOverrides, setFacetOverrides] = useState({}); // key -> { productId?, colorId? }
  const [selectedFacet, setSelectedFacet] = useState(null); // { key, faceId, role, layerId, sizeSf, pitch, orientation }
  const [currentProjectId, setCurrentProjectId] = useState(null);

  const viewerRef = useRef(null);
  const brand = BRANDS[brandId];

  // True when this load came from an exported HTML file or a shared/project
  // link — all open the full editable app for a customer, so the
  // manual/override discount field gets locked (they can still explore
  // colors/profiles and see any automatic package-deal discounts
  // recalculate live).
  const [isCustomerView, setIsCustomerView] = useState(false);

  const buildDesignSnapshot = () =>
    captureDesignState({
      brandId, house, roofProductId, roofProfile, roofColorId,
      wallProductId, wallProfile, wallColorId, services, lockedServices, gutterOptionId, downspoutOptionId,
      measurements, manualDiscount, layerOffsets, accessoryColors,
      uniformFinish, facetOverrides,
    });

  const applyDesignSnapshot = (snapshot, lock) => {
    if (lock) setIsCustomerView(true);
    applyDesignState(snapshot, {
      setBrandId,
      setHouse,
      setRoofProductId,
      setRoofProfile,
      setRoofColorId,
      setWallProductId,
      setWallProfile,
      setWallColorId,
      setServices,
      setLockedServices,
      setGutterOptionId,
      setDownspoutOptionId,
      setMeasurements,
      setManualDiscount,
      setLayerOffsets,
      setAccessoryColors,
      setUniformFinish,
      setFacetOverrides,
    });
  };

  // Standalone HTML exports embed a frozen design as
  // window.__IRONWRAP_DESIGN__ before this bundle runs; load it once on
  // mount so the exported file opens showing that customer's exact design.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__IRONWRAP_DESIGN__) {
      applyDesignSnapshot(window.__IRONWRAP_DESIGN__, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shareable links carry the whole design in a ?d= query param — decode
  // and load it once on mount if present.
  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('d');
    if (!encoded) return;
    decodeDesignFromUrl(encoded)
      .then((snapshot) => applyDesignSnapshot(snapshot, true))
      .catch((err) => console.error('Failed to load shared design link:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Project links (?p=<id>) reference a design saved to the Projects
  // database rather than embedding it directly — load it once on mount if
  // present.
  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get('p');
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((row) => {
        applyDesignSnapshot(row.design, true);
        setCurrentProjectId(projectId);
      })
      .catch((err) => console.error('Failed to load project link:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-parses only when a layer's content/visibility/order changes (offset
  // nudges are tracked separately in layerOffsets so dragging a slider never
  // re-parses XML or rebuilds the mesh scene).
  const parsedLayers = useMemo(
    () => house.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, parsed: parseAppliCadXML(l.xml) })),
    [house.layers]
  );

  // Keep the Assembly Adjustment layer selector pointed at a layer that
  // still exists after an add/remove.
  useEffect(() => {
    if (!house.layers.some((l) => l.id === activeLayerId)) {
      setActiveLayerId(house.layers[0]?.id);
    }
  }, [house.layers, activeLayerId]);

  // Facet ids are only unique within a single RoofRuler export, but keys are
  // namespaced by layer id, so an override/selection can only ever apply to
  // a face from the layer it was set on. Still, when layer content changes
  // (import/remove/reorder) any stored overrides could reference stale
  // faces — reset to be safe.
  useEffect(() => {
    setFacetOverrides({});
    setSelectedFacet(null);
  }, [parsedLayers]);

  const roofFacesForPricing = useMemo(() => {
    const out = [];
    parsedLayers.forEach((l) => {
      if (!l.visible) return;
      l.parsed.faces.filter((f) => f.type === 'Roof').forEach((f) => out.push({ key: facetKey(l.id, f.id), sizeSf: f.sizeSf }));
    });
    return out;
  }, [parsedLayers]);

  const wallFacesForPricing = useMemo(() => {
    const out = [];
    parsedLayers.forEach((l) => {
      if (!l.visible) return;
      l.parsed.faces.filter((f) => f.type === 'Wall').forEach((f) => out.push({ key: facetKey(l.id, f.id), sizeSf: f.sizeSf }));
    });
    return out;
  }, [parsedLayers]);

  // Aggregated across every visible layer, for the PDF's Window & Door
  // Schedule and Linear Footage/Accessories Takeoff tables.
  const openingsSchedule = useMemo(() => {
    const out = [];
    parsedLayers.forEach((l) => {
      if (!l.visible) return;
      collectOpenings(l.parsed).forEach((o) => out.push({ layerName: l.name, ...o }));
    });
    return out;
  }, [parsedLayers]);

  const lineTakeoffs = useMemo(() => {
    const out = {};
    parsedLayers.forEach((l) => {
      if (!l.visible) return;
      Object.entries(l.parsed.lineTakeoffs || {}).forEach(([type, len]) => {
        out[type] = (out[type] || 0) + len;
      });
    });
    return out;
  }, [parsedLayers]);

  const estimate = useMemo(
    () =>
      calculateEstimate(measurements, {
        roofProduct: roofProductId,
        wallProduct: wallProductId,
        roofFaces: roofFacesForPricing,
        wallFaces: wallFacesForPricing,
        facetOverrides: uniformFinish ? {} : extractProductOverrides(facetOverrides),
        services,
        gutterOption: gutterOptionId,
        downspoutOption: downspoutOptionId,
        manualDiscount,
      }),
    [measurements, roofProductId, wallProductId, roofFacesForPricing, wallFacesForPricing, uniformFinish, facetOverrides, services, gutterOptionId, downspoutOptionId, manualDiscount]
  );

  const facetColors = useMemo(() => {
    const map = {};
    const roofColor = colorById(roofColorId);
    roofFacesForPricing.forEach(({ key }) => {
      const override = !uniformFinish && facetOverrides[key];
      map[key] = override?.colorId ? colorById(override.colorId) : roofColor;
    });
    const wallColor = colorById(wallColorId);
    wallFacesForPricing.forEach(({ key }) => {
      const override = !uniformFinish && facetOverrides[key];
      map[key] = override?.colorId ? colorById(override.colorId) : wallColor;
    });
    return map;
  }, [roofFacesForPricing, wallFacesForPricing, facetOverrides, roofColorId, wallColorId, uniformFinish]);

  // Resets every field back to a blank slate — job#/customer/address, all
  // layers, product/color selections, overrides, everything — so starting a
  // new project can't leave any stale data behind from whatever was loaded
  // before. Also clears currentProjectId so the next "Download" creates a
  // fresh database record instead of overwriting the previous project.
  const handleNewProject = () => {
    if (!window.confirm('Start a new project? Any unsaved changes to the current design will be lost.')) return;
    setHouse(BLANK_HOUSE);
    setRoofProductId(ROOF_PRODUCTS[0].id);
    setRoofProfile(ROOF_PROFILES[ROOF_PRODUCTS[0].id]?.[0] || '');
    setRoofColorId('wk-04');
    setWallProductId(WALL_PRODUCTS[0].id);
    setWallProfile(WALL_PROFILES[WALL_PRODUCTS[0].id]?.[0] || '');
    setWallColorId('wk-01');
    setServices(DEFAULT_SERVICES);
    setLockedServices(DEFAULT_LOCKED_SERVICES);
    setGutterOptionId(GUTTER_OPTIONS[0].id);
    setDownspoutOptionId(DOWNSPOUT_OPTIONS[0].id);
    setMeasurements(BLANK_HOUSE.measurements);
    setPhotoOverlay(null);
    setManualDiscount(0);
    setLayerOffsets({});
    setActiveLayerId(undefined);
    setAccessoryColors(DEFAULT_ACCESSORY_COLORS);
    setUniformFinish(true);
    setFacetOverrides({});
    setSelectedFacet(null);
    setCurrentProjectId(null);
  };

  const handleRoofProductChange = (id) => {
    setRoofProductId(id);
    setRoofProfile(ROOF_PROFILES[id]?.[0] || '');
  };
  const handleWallProductChange = (id) => {
    setWallProductId(id);
    setWallProfile(WALL_PROFILES[id]?.[0] || '');
  };

  const handleHouseMetaChange = (patch) => setHouse((h) => ({ ...h, ...patch }));

  const handleAddLayer = (layer) => setHouse((h) => ({ ...h, layers: [...h.layers, layer] }));

  const handleRemoveLayer = (id) => {
    setHouse((h) => (h.layers.length <= 1 ? h : { ...h, layers: h.layers.filter((l) => l.id !== id) }));
    setLayerOffsets((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFacetOverrides((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, val]) => {
        if (!key.startsWith(`${id}:`)) next[key] = val;
      });
      return next;
    });
    setSelectedFacet((sf) => (sf?.layerId === id ? null : sf));
  };

  const handleToggleLayerVisibility = (id, visible) =>
    setHouse((h) => ({ ...h, layers: h.layers.map((l) => (l.id === id ? { ...l, visible } : l)) }));

  const handleRenameLayer = (id, name) =>
    setHouse((h) => ({ ...h, layers: h.layers.map((l) => (l.id === id ? { ...l, name } : l)) }));

  const handleLayerOffsetChange = (id, offset) => setLayerOffsets((prev) => ({ ...prev, [id]: offset }));
  const handleResetLayerOffset = (id) =>
    setLayerOffsets((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleFacetClick = (payload) => {
    if (uniformFinish) return;
    setSelectedFacet(payload);
  };

  const facetOverrideState = selectedFacet ? facetOverrides[selectedFacet.key] : null;
  const facetGlobalProductId = selectedFacet?.role === 'roof' ? roofProductId : wallProductId;
  const facetGlobalColorId = selectedFacet?.role === 'roof' ? roofColorId : wallColorId;

  const setFacetOverride = (patch) => {
    if (!selectedFacet) return;
    setFacetOverrides((prev) => ({ ...prev, [selectedFacet.key]: { ...prev[selectedFacet.key], ...patch } }));
  };

  const clearFacetOverride = () => {
    if (!selectedFacet) return;
    setFacetOverrides((prev) => {
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
      facetOverrides,
      roofFacesForPricing,
      wallFacesForPricing,
    });
    downloadTextFile(`${house.jobNumber}-estimate.txt`, text);
  };

  const handleExportHtml = async () => {
    let template;
    try {
      const res = await fetch('/snapshot-template.html');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      template = await res.text();
    } catch (err) {
      alert('Could not load the export template. Please try again.');
      return;
    }
    const state = buildDesignSnapshot();
    // Escape "</script>" sequences that could appear inside string values
    // (e.g. a customer name) so they can't break out of the inline script.
    const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
    const stateScript = `<script>window.__IRONWRAP_DESIGN__ = ${stateJson};</script>\n`;
    const html = template.replace('<script type="module">', `${stateScript}<script type="module">`);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IronWrap_Design_${house.jobNumber || 'export'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyShareLink = async () => {
    try {
      const state = buildDesignSnapshot();
      const encoded = await encodeDesignForUrl(state);
      const url = `${window.location.origin}${window.location.pathname}?d=${encoded}`;
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to build share link:', err);
      setShareStatus('Could not create link — please try again.');
    }
    setTimeout(() => setShareStatus(''), 4000);
  };

  const handleExportPdf = () => {
    buildEstimatePdf({
      brand,
      house,
      isoSnapshots: viewerRef.current?.captureIsoViews() || [],
      elevationViews: viewerRef.current?.captureElevationViews() || [],
      roofPlanView: viewerRef.current?.captureRoofPlanView() || null,
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
      facetOverrides,
      roofFacesForPricing,
      wallFacesForPricing,
      openingsSchedule,
      lineTakeoffs,
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
                  parsedLayers={parsedLayers}
                  layerOffsets={layerOffsets}
                  facetColors={facetColors}
                  photoOverlay={photoOverlay}
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
                <AssemblyAdjustment
                  layers={house.layers}
                  layerOffsets={layerOffsets}
                  activeLayerId={activeLayerId}
                  onActiveLayerChange={setActiveLayerId}
                  onChange={handleLayerOffsetChange}
                  onReset={handleResetLayerOffset}
                />
              </div>
            </>
          )}
        </section>

        <aside className="controls-pane">
          <LayersPanel
            house={house}
            onMetaChange={handleHouseMetaChange}
            onAddLayer={handleAddLayer}
            onRemoveLayer={handleRemoveLayer}
            onToggleVisibility={handleToggleLayerVisibility}
            onRenameLayer={handleRenameLayer}
            onNewProject={handleNewProject}
            readOnly={isCustomerView}
          />

          {!isCustomerView && (
            <ProjectsPanel
              getCurrentDesign={buildDesignSnapshot}
              onOpenProject={(design) => applyDesignSnapshot(design, false)}
              currentProjectId={currentProjectId}
              onProjectIdChange={setCurrentProjectId}
            />
          )}

          <div className="control-block">
            <label className="uniform-toggle">
              <input type="checkbox" checked={uniformFinish} onChange={(e) => setUniformFinish(e.target.checked)} />
              <span>All roof slopes / wall segments use the same profile and color</span>
            </label>
            {!uniformFinish && (
              <div className="control-sublabel">
                Click a roof slope or wall segment in the 3D model to set its own material and color.
                {Object.keys(facetOverrides).length > 0 ? ` ${Object.keys(facetOverrides).length} facet(s) customized.` : ''}
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
          <div className="control-block color-row">
            <span className="control-label">Roof Color</span>
            <ColorPickerButton selectedId={roofColorId} onChange={setRoofColorId} />
          </div>

          <ProductSelector
            label="Siding Material"
            products={WALL_PRODUCTS}
            profiles={WALL_PROFILES}
            selectedId={wallProductId}
            selectedProfile={wallProfile}
            onProductChange={handleWallProductChange}
            onProfileChange={setWallProfile}
          />
          <div className="control-block color-row">
            <span className="control-label">Siding Color</span>
            <ColorPickerButton selectedId={wallColorId} onChange={setWallColorId} />
          </div>

          <ServicesPanel
            services={services}
            onServicesChange={setServices}
            lockedServices={lockedServices}
            onLockedServicesChange={setLockedServices}
            measurements={measurements}
            onMeasurementsChange={setMeasurements}
            gutterOptionId={gutterOptionId}
            onGutterOptionChange={setGutterOptionId}
            downspoutOptionId={downspoutOptionId}
            onDownspoutOptionChange={setDownspoutOptionId}
            accessoryColors={accessoryColors}
            onAccessoryColorsChange={setAccessoryColors}
            readOnlyQuantities={isCustomerView}
            isCustomerView={isCustomerView}
          />

          <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />

          <PriceSummary
            estimate={estimate}
            manualDiscount={manualDiscount}
            onManualDiscountChange={setManualDiscount}
            readOnlyDiscount={isCustomerView}
          />

          {!isCustomerView && (
            <>
              <div className="export-buttons">
                <button type="button" className="btn-secondary" onClick={handleExportText}>Export Text</button>
                <button type="button" className="btn-secondary" onClick={handleExportHtml}>Export HTML</button>
                <button type="button" className="btn-primary" onClick={handleExportPdf}>Export PDF</button>
              </div>
              <div className="export-buttons">
                <button type="button" className="btn-secondary" onClick={handleCopyShareLink}>Copy Shareable Link</button>
              </div>
              {shareStatus && <div className="control-sublabel">{shareStatus}</div>}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
