import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Viewer3D from './components/Viewer3D.jsx';
import BrandToggle from './components/BrandToggle.jsx';
import ColorPickerButton from './components/ColorPickerButton.jsx';
import ProductSelector from './components/ProductSelector.jsx';
import ServicesPanel, { ServiceRow } from './components/ServicesPanel.jsx';
import PriceSummary from './components/PriceSummary.jsx';
import PhotoOverlayControl from './components/PhotoOverlayControl.jsx';
import AssemblyAdjustment from './components/AssemblyAdjustment.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import ProjectsPanel from './components/ProjectsPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import DiscountsPanel from './components/DiscountsPanel.jsx';
import CustomServicesPanel from './components/CustomServicesPanel.jsx';
import MaterialsPanel from './components/MaterialsPanel.jsx';
import AttachmentsPanel from './components/AttachmentsPanel.jsx';
import FacetInspector from './components/FacetInspector.jsx';
import PlatformConsole from './components/PlatformConsole.jsx';
import StudioShell from './components/StudioShell.jsx';
import StudioTopBar from './components/StudioTopBar.jsx';
import GuidedStepRail from './components/GuidedStepRail.jsx';
import ViewerWorkspace from './components/ViewerWorkspace.jsx';
import ContextInspector from './components/ContextInspector.jsx';
import EstimateDock from './components/EstimateDock.jsx';
import SalesStepContent from './components/SalesStepContent.jsx';
import { parseAppliCadXML, facetKey, collectOpenings, roofSqft, wallSqft } from './lib/roofRulerParser.js';
import { buildFacetLabelMap, labelOpenings } from './lib/facetLabels.js';
import { calculateEstimate } from './lib/pricingEngine.js';
import { buildEstimateText, downloadTextFile } from './lib/exportEstimate.js';
import { buildEstimatePdf } from './lib/exportPdf.js';
import { captureDesignState, applyDesignState, createStableDesignNormalizer, decodeDesignFromUrl } from './lib/designState.js';
import { normalizeCustomServiceLines } from './lib/designState.js';
import { createDesignRuntime, resolveSharedDesignPayload } from './lib/designRuntime.js';
import { buildAccountDefaultDesignSnapshot, buildNewProjectDesignSnapshot } from './lib/newProjectDesignState.js';
import { createDeferredDesignApplication, createInitialEditRestore, designFingerprint, getDesignPersistenceState, getProjectOperationState, getProjectSaveStatus } from './lib/studioDesignState.js';
import { defaultProjectName, downloadProjectFile, saveOrUpdateProject } from './lib/projects.js';
import { replaceEditProjectId } from './lib/projectNavigation.js';
import { urlToDataUrl } from './lib/fileUtils.js';
import { getInitialCustomerContext } from './lib/customerContext.js';
import { canShowExpertControl, resolveStudioMode } from './lib/studioMode.js';
import { parseStudioLayers } from './lib/studioRecovery.js';
import { STUDIO_STEPS, nextStudioStep, previousStudioStep } from './lib/studioSteps.js';
import { normalizeTrimAccents, syncTrimAccentsToLegacy } from './lib/trimAccents.js';
import { ROOF_PRODUCTS, ROOF_PROFILES, WALL_PRODUCTS, WALL_PROFILES, GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, allRoofProducts, allWallProducts, setExtraMaterials } from './data/pricing.js';
import { colorById, setExtraColors } from './data/colors.js';
import { BRANDS } from './data/brands.js';
import { SAMPLE_HOUSE } from './data/sampleHouse.js';
import { DEFAULT_SERVICES, DEFAULT_LOCKED_SERVICES, DEFAULT_ACCESSORY_COLORS } from './data/defaults.js';

// A thin shell over existing/future panel components, not a router:
// switching sections just toggles which one renders.
const NAV_SECTIONS = [
  { key: 'configurator', label: 'Configurator' },
  { key: 'settings', label: 'Settings' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'customServices', label: 'Custom Services' },
  { key: 'materials', label: 'Materials' },
];

// Maps a materials-table row (snake_case, DB shape) to the plain
// {id, label, pricePerSqft} shape ROOF_PRODUCTS/WALL_PRODUCTS already use,
// so allRoofProducts()/allWallProducts() in data/pricing.js can treat a
// custom material exactly like a baseline one everywhere it's looked up.
function toMaterialProduct(m) {
  return { id: m.id, label: m.name, pricePerSqft: Number(m.price_per_sqft) };
}

// Maps a colors-table row (snake_case, DB shape) to the plain
// {id, code, name, hex, series, thumbnail} shape RAL_COLORS already uses,
// so allColors() in data/colors.js can treat a custom color exactly like a
// baseline one everywhere it's looked up (swatch rendering, formatColorLabel).
function toColorEntry(c) {
  return { id: c.id, code: c.code || '', name: c.name, hex: c.hex, series: c.series, thumbnail: c.thumbnail_url || undefined };
}

// Shared by every plain "fetch JSON, bail on non-2xx" call in this file —
// several mount-time effects below otherwise repeat the same
// then/throw/then/catch chain with only the URL and setter changing.
function fetchJson(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function extractProductOverrides(overrides) {
  const result = {};
  Object.entries(overrides).forEach(([key, val]) => {
    if (val?.productId) result[key] = val.productId;
  });
  return result;
}

export default function App({ currentUser = null }) {
  const [brandId, setBrandId] = useState('ironwrap');
  const [house, setHouse] = useState(SAMPLE_HOUSE);

  const [roofProductId, setRoofProductId] = useState(ROOF_PRODUCTS[0].id);
  const [roofProfile, setRoofProfile] = useState(ROOF_PROFILES[ROOF_PRODUCTS[0].id]?.[0] || '');
  const [roofColorId, setRoofColorId] = useState('wg-02'); // Driftwood — light, neutral

  const [wallProductId, setWallProductId] = useState(WALL_PRODUCTS[0].id);
  const [wallProfile, setWallProfile] = useState(WALL_PROFILES[WALL_PRODUCTS[0].id]?.[0] || '');
  const [wallColorId, setWallColorId] = useState('wg-02'); // Driftwood — light, neutral

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
  const [trimAccents, setTrimAccents] = useState(() => normalizeTrimAccents({
    measurements: house.measurements,
    accessoryColors: DEFAULT_ACCESSORY_COLORS,
    lockedServices: DEFAULT_LOCKED_SERVICES,
  }));
  const [viewerMode, setViewerMode] = useState('normal'); // 'normal' | 'minimized' | 'maximized'

  const [uniformFinish, setUniformFinish] = useState(true);
  const [facetOverrides, setFacetOverrides] = useState({}); // key -> { productId?, colorId? }
  const [selectedFacet, setSelectedFacet] = useState(null); // { key, faceId, role, layerId, sizeSf, pitch, orientation }
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [persistedDesignFingerprint, setPersistedDesignFingerprint] = useState(null);
  const projectDesignApplicationRef = useRef(null);
  if (!projectDesignApplicationRef.current) {
    projectDesignApplicationRef.current = createDeferredDesignApplication();
  }
  const initialEditRestoreRef = useRef(null);
  if (!initialEditRestoreRef.current) {
    initialEditRestoreRef.current = createInitialEditRestore(window.location.search);
  }
  const cancelInitialEditRestore = () => initialEditRestoreRef.current.cancel();
  const [approvedAt, setApprovedAt] = useState(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [activeSection, setActiveSection] = useState('configurator');
  const [activeStudioStep, setActiveStudioStep] = useState('project');
  const [expertRequested, setExpertRequested] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(true);
  const [shellNotice, setShellNotice] = useState('');
  const [projectActionStatus, setProjectActionStatus] = useState('');
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [projectListRevision, setProjectListRevision] = useState(0);
  const projectActionStatusTimeoutRef = useRef(null);
  const capabilities = currentUser?.capabilities || [];
  const canViewPlatform = capabilities.includes('platform.diagnostics.read');
  const [companySettings, setCompanySettings] = useState(null);
  const [companySettingsSettled, setCompanySettingsSettled] = useState(false);
  const [designRuntime, setDesignRuntime] = useState(() => (
    typeof window !== 'undefined' && window.__IRONWRAP_RUNTIME__
      ? createDesignRuntime(window.__IRONWRAP_RUNTIME__.unitSystem)
      : null
  ));
  const effectiveUnitSystem = designRuntime?.unitSystem || companySettings?.unit_system || 'imperial';
  const showExpertControl = canShowExpertControl({
    role: currentUser?.role || null,
    entitled: companySettings?.expertModeEntitled,
    tenantPreference: companySettings?.show_expert_mode,
  });
  const [defaultCatalogsSettled, setDefaultCatalogsSettled] = useState(false);
  // Business identity/contact (name, phone, address, website/social) — on
  // the `users` row (see AuthGate.jsx's signup fields), not `settings`.
  // Fetched only for the PDF cover page; hidden there when blank.
  const [companyProfile, setCompanyProfile] = useState(null);
  // Raw Materials Library rows (with each material's colorIds — see
  // api/materials/[[...id]].js's ?colors=1 link) — kept alongside
  // setExtraMaterials()'s mapped {id,label,pricePerSqft} shape so the
  // roof/wall color pickers can look up "does the selected material
  // restrict which colors apply" (Phase 10's material↔color linking).
  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const applyMaterialsCatalog = (rows) => {
    setMaterialsCatalog(rows);
    setExtraMaterials({ roof: rows.filter((m) => m.kind === 'roof').map(toMaterialProduct), wall: rows.filter((m) => m.kind === 'wall').map(toMaterialProduct) });
  };
  // Once a design has been saved or loaded, this freezes the GST/discount
  // rates it was quoted at — see designState.js's pricingSettings comment.
  // null means "not frozen yet," i.e. a brand-new project still tracking
  // whatever the live companySettings currently say.
  const [pricingSettings, setPricingSettings] = useState(null);
  // Resolved custom-service selections on the current project (name/price
  // frozen from the owner's catalog at add-time) — the catalog itself
  // (customServiceCatalog) is separate, admin-only, and only fetched for
  // non-customer views since the customer-facing route is unauthenticated.
  const [customServiceLines, setCustomServiceLines] = useState([]);
  const [customServiceCatalog, setCustomServiceCatalog] = useState([]);
  // Current project's attachments — kept in App state (not just inside
  // AttachmentsPanel) so PDF/text export can read them at export-click time
  // without a second fetch.
  const [attachments, setAttachments] = useState([]);

  // Owner editing uses its own URL state (`?edit=`), separate from the
  // public customer link (`?p=`). Keeping it in the URL makes refreshes
  // deterministic without leaking a previous account's project through
  // localStorage on a shared computer.
  const setOwnerProjectId = (projectId) => {
    setCurrentProjectId(projectId);
    replaceEditProjectId(projectId);
  };

  const viewerRef = useRef(null);
  const brand = BRANDS[brandId];

  // True when this load came from an exported HTML file or a shared/project
  // link — all open the full editable app for a customer, so the
  // manual/override discount field gets locked (they can still explore
  // colors/profiles and see any automatic package-deal discounts
  // recalculate live).
  const [isCustomerView, setIsCustomerView] = useState(getInitialCustomerContext);
  const studioMode = resolveStudioMode({
    isCustomerView,
    activeSection,
    role: currentUser?.role || null,
    capabilities,
    expertRequested,
    tenantEntitlement: companySettings?.expertModeEntitled === true,
  });

  // Render only pre-written, non-sensitive notices. Diagnostics remain in
  // the developer console and never become shell content.
  const showLoadNotice = (diagnostic, notice, error) => {
    console.error(diagnostic, error);
    setShellNotice(notice);
  };

  // A design that's already been saved/loaded prices off the rates it was
  // frozen at (pricingSettings); a brand-new one still tracks whatever
  // Settings currently says (companySettings). Computed once here and
  // reused both to freeze into a saved project (buildDesignSnapshot below)
  // and to feed the live `estimate` calculation, rather than repeating the
  // same pricingSettings-or-companySettings fallback per field in each.
  const effectivePricingSettings = pricingSettings || (companySettings ? {
    gstRate: Number(companySettings.gst_rate),
    fullWrapDiscountPct: Number(companySettings.full_wrap_discount_pct),
    soffitFasciaDiscountPct: Number(companySettings.soffit_fascia_discount_pct),
    gutterDownspoutFree: companySettings.gutter_downspout_free,
    discountRules: companySettings.discount_rules || null,
    municipalTaxRate: Number(companySettings.municipal_tax_rate || 0),
    taxLabel: companySettings.tax_label || 'GST',
  } : null);

  const stableDesignNormalizerRef = useRef(null);
  const [designDefaultsReady, setDesignDefaultsReady] = useState(isCustomerView);
  // Public shared designs have no authenticated account defaults to await.
  // Capture today's built-in fallback during the first render so the mount
  // restore effects below retain their existing synchronous ordering.
  if (isCustomerView && !stableDesignNormalizerRef.current) {
    stableDesignNormalizerRef.current = createStableDesignNormalizer(
      buildAccountDefaultDesignSnapshot({
        companySettings: null,
        customServiceCatalog: [],
        effectivePricingSettings: null,
        house: SAMPLE_HOUSE,
      })
    );
  }

  const currentDesignSnapshot = useMemo(
    () => captureDesignState({
      brandId, house, roofProductId, roofProfile, roofColorId,
      wallProductId, wallProfile, wallColorId, services, lockedServices, gutterOptionId, downspoutOptionId,
      measurements, manualDiscount, layerOffsets, accessoryColors, trimAccents,
      uniformFinish, facetOverrides, customServiceLines,
      pricingSettings: effectivePricingSettings,
    }),
    [
      accessoryColors, brandId, companySettings, customServiceLines, downspoutOptionId,
      facetOverrides, gutterOptionId, house, layerOffsets, lockedServices, manualDiscount,
      measurements, pricingSettings, roofColorId, roofProductId, roofProfile, services, trimAccents,
      uniformFinish, wallColorId, wallProductId, wallProfile,
    ]
  );

  // Authenticated legacy projects normalize against one account fallback
  // baseline captured only after settings and the catalogs that resolve
  // default selections have all settled. The normalizer owns a serialized
  // copy, so later project opens and edits cannot alter this fallback.
  useEffect(() => {
    if (stableDesignNormalizerRef.current || isCustomerView || !companySettingsSettled || !defaultCatalogsSettled) return;
    const accountDefaults = buildAccountDefaultDesignSnapshot({
      companySettings,
      customServiceCatalog,
      effectivePricingSettings,
    });
    stableDesignNormalizerRef.current = createStableDesignNormalizer(accountDefaults);
    projectDesignApplicationRef.current.setReady((snapshot) => applyDesignSnapshot(snapshot, false));
    setDesignDefaultsReady(true);
  }, [companySettings, companySettingsSettled, customServiceCatalog, defaultCatalogsSettled, effectivePricingSettings, isCustomerView]);

  const buildDesignSnapshot = () => currentDesignSnapshot;
  const currentDesignFingerprint = useMemo(
    () => designFingerprint(currentDesignSnapshot),
    [currentDesignSnapshot]
  );
  const markDesignPersisted = (design) => {
    if (!design?.pricingSettings && !isCustomerView) return;
    if (design?.pricingSettings) setPricingSettings(design.pricingSettings);
    setPersistedDesignFingerprint(designFingerprint(design));
  };
  const persistence = getDesignPersistenceState({
    isCustomerView,
    companySettingsSettled,
    effectivePricingSettings,
  });
  const projectOperations = getProjectOperationState({
    accountSettled: Boolean(currentUser),
    defaultsReady: designDefaultsReady,
    persistenceReady: persistence.ready,
  });
  const projectSaveStatus = getProjectSaveStatus({
    currentProjectId,
    currentDesignFingerprint,
    persistedDesignFingerprint,
    persistenceReady: persistence.ready,
  });

  useEffect(() => () => {
    if (projectActionStatusTimeoutRef.current) clearTimeout(projectActionStatusTimeoutRef.current);
  }, []);

  const showTimedProjectActionStatus = (status) => {
    if (projectActionStatusTimeoutRef.current) clearTimeout(projectActionStatusTimeoutRef.current);
    setProjectActionStatus(status);
    projectActionStatusTimeoutRef.current = setTimeout(() => setProjectActionStatus(''), 5000);
  };

  const applyCurrentDesignState = (design) => {
    if (!design) return null;
    applyDesignState(design, {
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
      setTrimAccents,
      setUniformFinish,
      setFacetOverrides,
      setPricingSettings,
      setCustomServiceLines,
    });
    return design;
  };

  const applyDesignSnapshot = (snapshot, lock) => {
    if (lock) setIsCustomerView(true);
    const normalizedDesign = stableDesignNormalizerRef.current?.(snapshot);
    if (!normalizedDesign) return null;
    applyCurrentDesignState(normalizedDesign);
    return normalizedDesign;
  };

  // Standalone HTML exports embed a frozen design as
  // window.__IRONWRAP_DESIGN__ before this bundle runs; load it once on
  // mount so the exported file opens showing that customer's exact design.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__IRONWRAP_DESIGN__) {
      try {
        const restoredDesign = applyDesignSnapshot(window.__IRONWRAP_DESIGN__, true);
        // Present since the HTML export flow (handleExportHtml) saves the
        // design as a project and embeds its id, precisely so this exported
        // file's "Approve This Design" button (which needs a project id to
        // POST to) shows up the same way a ?p= link's does.
        if (window.__IRONWRAP_DESIGN__.projectId) {
          setCurrentProjectId(window.__IRONWRAP_DESIGN__.projectId);
          markDesignPersisted(restoredDesign);
        }
      } catch (error) {
        showLoadNotice('Failed to load embedded shared design:', 'We couldn’t open the shared design. The current design is still available.', error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shareable links carry the whole design in a ?d= query param — decode
  // and load it once on mount if present.
  useEffect(() => {
    const encoded = new URLSearchParams(window.location.search).get('d');
    if (!encoded) return;
    decodeDesignFromUrl(encoded)
      .then((snapshot) => {
        const sharedPayload = resolveSharedDesignPayload(snapshot);
        setDesignRuntime(sharedPayload.runtime);
        return applyDesignSnapshot(sharedPayload.design, true);
      })
      .catch((error) => showLoadNotice('Failed to load shared design link:', 'We couldn’t open the shared design. The current design is still available.', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Project links (?p=<id>) reference a design saved to the Projects
  // database rather than embedding it directly — load it once on mount if
  // present.
  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get('p');
    if (!projectId) return;
    fetchJson(`/api/projects/${projectId}`)
      .then((row) => {
        setDesignRuntime(createDesignRuntime(row.runtime?.unitSystem));
        const restoredDesign = applyDesignSnapshot(row.design, true);
        setCurrentProjectId(projectId);
        markDesignPersisted(restoredDesign);
        setApprovedAt(row.approved_at || null);
        // A customer exploring this shared link should see the same custom
        // Materials/Colors Library entries the owner set up, not just the
        // baseline catalog — ownerId comes straight off this already-public
        // project row, so no login is needed for these two reads either.
        if (row.owner_id) {
          fetch(`/api/colors?ownerId=${row.owner_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => setExtraColors(rows.map(toColorEntry)))
            .catch((error) => showLoadNotice('Failed to load shared project colors:', 'Some shared project options are unavailable. Built-in options remain available.', error));
          fetch(`/api/materials?ownerId=${row.owner_id}`)
            .then((r) => (r.ok ? r.json() : []))
            .then(applyMaterialsCatalog)
            .catch((error) => showLoadNotice('Failed to load shared project materials:', 'Some shared project options are unavailable. Built-in options remain available.', error));
        }
      })
      .catch((error) => showLoadNotice('Failed to load shared project:', 'We couldn’t load the shared project. The current design is still available.', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the owner's editable project after a refresh. Unlike `?p=`,
  // this does not enter customer mode or lock owner-only controls.
  useEffect(() => {
    const projectId = initialEditRestoreRef.current.claim(designDefaultsReady);
    if (!projectId) return;
    fetchJson(`/api/projects/${projectId}`)
      .then((row) => {
        const restoredDesign = applyDesignSnapshot(row.design, false);
        setCurrentProjectId(projectId);
        markDesignPersisted(restoredDesign);
        setApprovedAt(row.approved_at || null);
      })
      .catch((error) => showLoadNotice('Failed to restore saved project:', 'We couldn’t restore the saved project. The current design is still available; open Project to retry.', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designDefaultsReady]);

  // Company-wide settings (GST rate, package-deal percentages, New Project
  // defaults, report footer) — fetched once and applied on top of today's
  // hardcoded fallbacks, so the app behaves identically until an admin
  // actually changes something in the Settings panel. Skipped entirely for
  // customer-facing entry points (checked directly rather than via
  // isCustomerView state, which hasn't committed yet this early) — it's now
  // an authenticated, per-owner route a logged-out customer can't call
  // anyway, and pricingSettings (frozen at save time) is what customer views
  // actually price off of.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.__IRONWRAP_DESIGN__ || params.has('p') || params.has('d')) {
      setCompanySettingsSettled(true);
      setDefaultCatalogsSettled(true);
      return;
    }
    fetchJson('/api/settings')
      .then(setCompanySettings)
      .catch((error) => showLoadNotice('Failed to load account settings:', 'Pricing settings are unavailable. Refresh before saving or sharing this design.', error))
      .finally(() => setCompanySettingsSettled(true));
    fetchJson('/api/auth/me').then(setCompanyProfile).catch((error) => showLoadNotice('Failed to load account profile:', 'Some account details are unavailable. The design tools remain available.', error));
    const defaultCatalogRequests = [
      fetchJson('/api/custom-services').then(setCustomServiceCatalog).catch((error) => showLoadNotice('Failed to load saved service options:', 'Some saved service options are unavailable. Built-in options remain available.', error)),
      fetchJson('/api/colors').then((rows) => setExtraColors(rows.map(toColorEntry))).catch((error) => showLoadNotice('Failed to load saved color options:', 'Some saved color options are unavailable. Built-in options remain available.', error)),
      fetchJson('/api/materials').then(applyMaterialsCatalog).catch((error) => showLoadNotice('Failed to load saved material options:', 'Some saved material options are unavailable. Built-in options remain available.', error)),
    ];
    Promise.allSettled(defaultCatalogRequests).then(() => setDefaultCatalogsSettled(true));
  }, []);

  // Re-parses only when a layer's content/visibility/order changes (offset
  // nudges are tracked separately in layerOffsets so dragging a slider never
  // re-parses XML or rebuilds the mesh scene).
  const { parsedLayers, parseFailures } = useMemo(
    () => parseStudioLayers(house.layers, parseAppliCadXML),
    [house.layers]
  );

  // Whether ANY imported layer actually contains Roof/Wall faces (RoofRuler
  // XML self-declares each face's type — see roofRulerParser.js) — gates the
  // Roof Material/Siding Material sections so a roof-only import doesn't show
  // an irrelevant wall material/color picker, and vice versa.
  const hasRoofFaces = useMemo(() => parsedLayers.some((l) => roofSqft(l.parsed) > 0), [parsedLayers]);
  const hasWallFaces = useMemo(() => parsedLayers.some((l) => wallSqft(l.parsed) > 0), [parsedLayers]);

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

  // Clean, collision-free per-type labels (R1/F1/W1/D1/O1) for the PDF —
  // independent of the raw RoofRuler face ids, which can collide between a
  // roof export and a wall export.
  const facetLabels = useMemo(
    () => buildFacetLabelMap(roofFacesForPricing, wallFacesForPricing),
    [roofFacesForPricing, wallFacesForPricing]
  );
  const labeledOpenings = useMemo(() => labelOpenings(openingsSchedule), [openingsSchedule]);

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
        // effectivePricingSettings already resolves "frozen rates from a
        // saved project, else whatever Settings currently says, else
        // undefined for everything" — see its definition above.
        ...(effectivePricingSettings || {}),
        customServiceLines,
      }),
    [measurements, roofProductId, wallProductId, roofFacesForPricing, wallFacesForPricing, uniformFinish, facetOverrides, services, gutterOptionId, downspoutOptionId, manualDiscount, companySettings, pricingSettings, customServiceLines]
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

  // True when at least one facet has been overridden to a color different
  // from the global default — the Roof/Siding Color button can't show a
  // single swatch in that case, so it reads "Various Colors" instead.
  const isColorMixed = (faces, colorId) =>
    !uniformFinish && faces.some(({ key }) => {
      const c = facetOverrides[key]?.colorId;
      return c && c !== colorId;
    });
  const roofColorMixed = isColorMixed(roofFacesForPricing, roofColorId);
  const wallColorMixed = isColorMixed(wallFacesForPricing, wallColorId);

  // Resets every field back to a blank slate — job#/customer/address, all
  // layers, product/color selections, overrides, everything — so starting a
  // new project can't leave any stale data behind from whatever was loaded
  // before. Also clears currentProjectId so the next "Download" creates a
  // fresh database record instead of overwriting the previous project.
  const handleNewProject = () => {
    if (projectActionBusy) return;
    if (!window.confirm('Start a new project? Any unsaved changes to the current design will be lost.')) return;
    const newProjectDesign = buildNewProjectDesignSnapshot({
      companySettings,
      customServiceCatalog,
    });
    applyCurrentDesignState(newProjectDesign);
    setPhotoOverlay(null);
    setAttachments([]);
    setActiveLayerId(undefined);
    setSelectedFacet(null);
    setOwnerProjectId(null);
    setPersistedDesignFingerprint(null);
    setApprovedAt(null);
  };

  // One save/download path serves both the top-bar action and ProjectsPanel,
  // so project identity, persistence tracking, and the pointer download can
  // never drift between the two entry points.
  const handleSaveProject = async () => {
    if (!projectOperations.canSave || projectActionBusy) return null;
    setProjectActionBusy(true);
    setProjectActionStatus('Saving...');
    try {
      const design = buildDesignSnapshot();
      const saved = await saveOrUpdateProject(design, currentProjectId);
      setOwnerProjectId(saved.id);
      markDesignPersisted(design);
      downloadProjectFile(saved.id, design, defaultProjectName(house));
      setProjectListRevision((revision) => revision + 1);
      showTimedProjectActionStatus('Project saved — file downloaded.');
      return saved;
    } catch (error) {
      console.error('Projects API error:', error);
      showTimedProjectActionStatus('Could not reach the Projects database — it may not be reachable from this environment yet.');
      return null;
    } finally {
      setProjectActionBusy(false);
    }
  };

  const handleRoofProductChange = (id) => {
    setRoofProductId(id);
    setRoofProfile(ROOF_PROFILES[id]?.[0] || '');
  };
  const handleWallProductChange = (id) => {
    setWallProductId(id);
    setWallProfile(WALL_PROFILES[id]?.[0] || '');
  };

  const handleTrimAccentsChange = (nextTrimAccents) => {
    setTrimAccents(nextTrimAccents);
    setMeasurements((current) => syncTrimAccentsToLegacy(nextTrimAccents, {
      measurements: current,
    }).measurements);
    setAccessoryColors((current) => syncTrimAccentsToLegacy(nextTrimAccents, {
      accessoryColors: current,
    }).accessoryColors);
    setLockedServices((current) => syncTrimAccentsToLegacy(nextTrimAccents, {
      lockedServices: current,
    }).lockedServices);
  };

  const handleCustomServiceLinesChange = (nextLines) => {
    setCustomServiceLines(normalizeCustomServiceLines(nextLines));
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
      roofProduct: allRoofProducts().find((p) => p.id === roofProductId),
      roofColorId,
      roofProfile,
      wallProduct: allWallProducts().find((p) => p.id === wallProductId),
      wallColorId,
      wallProfile,
      estimate,
      accessoryColors,
      uniformFinish,
      facetOverrides,
      roofFacesForPricing,
      wallFacesForPricing,
      attachments,
    });
    downloadTextFile(`${house.jobNumber}-estimate.txt`, text);
  };

  const handleExportHtml = async () => {
    if (!projectOperations.canShare || projectActionBusy) return null;
    setProjectActionBusy(true);
    setProjectActionStatus('Preparing shared design...');
    try {
      const state = buildDesignSnapshot();

      // Template fetch and project save are independent, so settle both in
      // parallel while keeping the shared operation lock for their full life.
      const [templateResult, projectSaveResult] = await Promise.allSettled([
        fetch('/snapshot-template.html').then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
        saveOrUpdateProject(state, currentProjectId),
      ]);

      // Reconcile a completed database write before considering whether the
      // template can be downloaded. Otherwise a template-only failure leaves
      // App on a stale identity and a retry creates a duplicate project.
      let saved = null;
      if (projectSaveResult.status === 'fulfilled') {
        saved = projectSaveResult.value;
        if (saved?.id) {
          setOwnerProjectId(saved.id);
          markDesignPersisted(state);
        }
      }

      if (templateResult.status === 'rejected') {
        console.error('Failed to load the export template:', templateResult.reason);
        alert('Could not load the export template. Please try again.');
        showTimedProjectActionStatus('Could not prepare the shared design. Please try again.');
        return null;
      }
      const template = templateResult.value;

      // A failed save leaves the export without a project id and therefore
      // without customer approval. Preserve the existing explicit opt-in to
      // download that reduced file.
      if (projectSaveResult.status === 'rejected') {
        console.error('Failed to save project before HTML export:', projectSaveResult.reason);
        const proceed = window.confirm(
          "Couldn't save this design to your account, so the shared file won't include an \"Approve This Design\" button. "
          + "Make sure you're signed in and try again — or click OK to download it without the Approve button."
        );
        if (!proceed) {
          showTimedProjectActionStatus('Shared design was not downloaded because the project could not be saved.');
          return null;
        }
      }
      const stateWithProject = saved?.id ? { ...state, projectId: saved.id } : state;

      // Escape "</script>" sequences that could appear inside string values
      // (e.g. a customer name) so they can't break out of the inline script.
      const stateJson = JSON.stringify(stateWithProject).replace(/</g, '\\u003c');
      const runtimeJson = JSON.stringify(createDesignRuntime(effectiveUnitSystem)).replace(/</g, '\\u003c');
      const originJson = JSON.stringify(window.location.origin);
      const stateScript = `<script>window.__IRONWRAP_DESIGN__ = ${stateJson}; window.__IRONWRAP_RUNTIME__ = ${runtimeJson}; window.__IRONWRAP_ORIGIN__ = ${originJson};</script>\n`;
      const html = template.replace('<script type="module">', `${stateScript}<script type="module">`);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IronWrap_Design_${house.jobNumber || 'export'}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showTimedProjectActionStatus(saved?.id
        ? 'Shared design downloaded.'
        : 'Shared design downloaded without saving to Projects.');
      return saved;
    } catch (error) {
      console.error('Failed to export shared design:', error);
      showTimedProjectActionStatus('Could not prepare the shared design. Please try again.');
      return null;
    } finally {
      setProjectActionBusy(false);
    }
  };

  const handleExportPdf = async () => {
    // Only a saved project has a `?p=<id>` link to encode — a brand-new,
    // never-saved design has nothing to point the QR at, so it's omitted
    // rather than forcing a save as a side effect of exporting a PDF.
    const shareUrl = currentProjectId ? `${window.location.origin}${window.location.pathname}?p=${currentProjectId}` : null;

    // These three don't depend on each other, so they run concurrently
    // instead of one `await` blocking the next. jsPDF's addImage needs an
    // already-loaded image, not a remote URL — logo and photo attachments
    // get converted to data URLs here rather than inside exportPdf.js. A
    // failure in any one (bad QR input, deleted Blob, network hiccup) is
    // swallowed so it doesn't block the rest of the export.
    const [qrDataUrl, logoDataUrl, attachmentPhotos] = await Promise.all([
      shareUrl
        ? QRCode.toDataURL(shareUrl, { margin: 1, width: 300 }).catch((err) => { console.error('QR code generation failed:', err); return null; })
        : Promise.resolve(null),
      companySettings?.logo_url
        ? urlToDataUrl(companySettings.logo_url).catch((err) => { console.error('Logo fetch failed:', err); return null; })
        : Promise.resolve(null),
      Promise.all(
        attachments.filter((a) => a.kind === 'photo').map(async (a) => {
          try {
            return { ...a, dataUrl: await urlToDataUrl(a.url) };
          } catch (err) {
            console.error('Attachment photo fetch failed:', err);
            return null;
          }
        })
      ),
    ]);
    buildEstimatePdf({
      brand,
      house,
      isoSnapshots: viewerRef.current?.captureIsoViews() || [],
      elevationViews: viewerRef.current?.captureElevationViews() || [],
      roofPlanView: viewerRef.current?.captureRoofPlanView() || null,
      roofProduct: allRoofProducts().find((p) => p.id === roofProductId),
      roofColorId,
      roofProfile,
      wallProduct: allWallProducts().find((p) => p.id === wallProductId),
      wallColorId,
      wallProfile,
      estimate,
      accessoryColors,
      uniformFinish,
      facetOverrides,
      roofFacesForPricing,
      wallFacesForPricing,
      qrDataUrl,
      shareUrl,
      logoDataUrl,
      reportFooterNote: companySettings?.report_footer_note,
      companyProfile,
      facetLabels,
      openingsSchedule: labeledOpenings,
      lineTakeoffs,
      attachmentFiles: attachments.filter((a) => a.kind === 'file'),
      attachmentPhotos: attachmentPhotos.filter(Boolean),
    });
  };

  const handleApproveDesign = async () => {
    if (!currentProjectId) return;
    setApproveBusy(true);
    try {
      // In the live app / a ?p= link this is same-origin (base is ''); in a
      // standalone exported file it's the origin embedded at export time, so
      // approval reaches the real server instead of a dead relative path.
      const base = (typeof window !== 'undefined' && window.__IRONWRAP_ORIGIN__) || '';
      const res = await fetch(`${base}/api/projects/${currentProjectId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      setApprovedAt(row.approved_at);
    } catch (err) {
      console.error('Failed to approve design:', err);
      alert('Could not submit approval — please try again.');
    }
    setApproveBusy(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = window.location.pathname;
    }
  };

  const projectContent = (
    <LayersPanel
      house={house}
      onMetaChange={handleHouseMetaChange}
      onAddLayer={handleAddLayer}
      onRemoveLayer={handleRemoveLayer}
      onToggleVisibility={handleToggleLayerVisibility}
      onRenameLayer={handleRenameLayer}
      onNewProject={handleNewProject}
      projectOperationBusy={projectActionBusy}
      readOnly={isCustomerView}
    />
  );

  const projectPanelsContent = (
    <>
      {!isCustomerView && (
        <ProjectsPanel
          house={house}
          onSaveProject={handleSaveProject}
          onOpenProjectStart={cancelInitialEditRestore}
          onOpenProject={projectDesignApplicationRef.current.apply}
          currentProjectId={currentProjectId}
          onProjectIdChange={setOwnerProjectId}
          onDesignPersisted={markDesignPersisted}
          canOpen={projectOperations.canOpen}
          canSave={projectOperations.canSave}
          persistenceMessage={projectOperations.message}
          refreshKey={projectListRevision}
          operationBusy={projectActionBusy}
        />
      )}

      {currentProjectId && (
        <AttachmentsPanel
          projectId={currentProjectId}
          isCustomerView={isCustomerView}
          onChanged={setAttachments}
        />
      )}
    </>
  );

  const uniformFinishContent = (
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
  );

  const roofSelectionContent = hasRoofFaces && (
    <>
      <ServiceRow
        label="Roof" checked={services.roof} onToggle={(val) => setServices((s) => ({ ...s, roof: val }))}
        readOnly={isCustomerView} locked={lockedServices?.roof}
        onToggleLock={(val) => setLockedServices((s) => ({ ...s, roof: val }))} showLockToggle={!isCustomerView}
      />
      <ProductSelector
        label="Roof Material"
        products={allRoofProducts()}
        profiles={ROOF_PROFILES}
        selectedId={roofProductId}
        selectedProfile={roofProfile}
        onProductChange={handleRoofProductChange}
        onProfileChange={setRoofProfile}
      />
      <div className="control-block color-row">
        <span className="control-label">Roof Color</span>
        <ColorPickerButton selectedId={roofColorId} onChange={setRoofColorId} mixed={roofColorMixed} allowedColorIds={materialsCatalog.find((m) => m.id === roofProductId)?.colorIds} />
      </div>
    </>
  );

  const roofContent = (
    <>
      {uniformFinishContent}
      {roofSelectionContent}
    </>
  );

  const sidingSelectionContent = hasWallFaces && (
    <>
      <ServiceRow
        label="Wall" checked={services.wall} onToggle={(val) => setServices((s) => ({ ...s, wall: val }))}
        readOnly={isCustomerView} locked={lockedServices?.wall}
        onToggleLock={(val) => setLockedServices((s) => ({ ...s, wall: val }))} showLockToggle={!isCustomerView}
      />
      <ProductSelector
        label="Siding Material"
        products={allWallProducts()}
        profiles={WALL_PROFILES}
        selectedId={wallProductId}
        selectedProfile={wallProfile}
        onProductChange={handleWallProductChange}
        onProfileChange={setWallProfile}
      />
      <div className="control-block color-row">
        <span className="control-label">Siding Color</span>
        <ColorPickerButton selectedId={wallColorId} onChange={setWallColorId} mixed={wallColorMixed} allowedColorIds={materialsCatalog.find((m) => m.id === wallProductId)?.colorIds} />
      </div>
    </>
  );

  const sidingContent = (
    <>
      {uniformFinishContent}
      {sidingSelectionContent}
    </>
  );

  const servicesPanelProps = {
    services,
    onServicesChange: setServices,
    lockedServices,
    onLockedServicesChange: setLockedServices,
    measurements,
    onMeasurementsChange: setMeasurements,
    gutterOptionId,
    onGutterOptionChange: setGutterOptionId,
    downspoutOptionId,
    onDownspoutOptionChange: setDownspoutOptionId,
    accessoryColors,
    onAccessoryColorsChange: setAccessoryColors,
    readOnlyQuantities: isCustomerView,
    isCustomerView,
    customServiceLines,
    onCustomServiceLinesChange: handleCustomServiceLinesChange,
    customServiceCatalog,
    trimAccents,
    onTrimAccentsChange: handleTrimAccentsChange,
    unitSystem: effectiveUnitSystem,
  };

  const servicesContent = (
    <ServicesPanel section="services" {...servicesPanelProps} />
  );

  const accentsContent = (
    <>
      <ServicesPanel section="accents" {...servicesPanelProps} />
      <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />
    </>
  );

  const priceSummaryContent = (
    <PriceSummary
      estimate={estimate}
      manualDiscount={manualDiscount}
      onManualDiscountChange={setManualDiscount}
      readOnlyDiscount={isCustomerView}
    />
  );

  const approvalContent = isCustomerView && currentProjectId && (
    <div className="control-block">
      {approvedAt ? (
        <div className="control-sublabel">
          Approved on {new Date(approvedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={handleApproveDesign} disabled={approveBusy} style={{ width: '100%' }}>
          Approve This Design
        </button>
      )}
    </div>
  );

  const exportContent = !isCustomerView && (
    <>
      <div className="export-buttons">
        <button type="button" className="btn-secondary" onClick={handleExportText}>Export Text</button>
        <button type="button" className="btn-secondary" onClick={handleExportHtml} disabled={projectActionBusy || !projectOperations.canShare}>Share Design</button>
        <button type="button" className="btn-primary" onClick={handleExportPdf}>Export PDF</button>
      </div>
      {!projectOperations.canShare && <div className="control-sublabel" role="status">{projectOperations.message}</div>}
    </>
  );

  const reviewContent = (
    <>
      {priceSummaryContent}
      {approvalContent}
      {exportContent}
    </>
  );

  const fullControlsContent = (
    <div className="controls-pane">
      {uniformFinishContent}
      {roofSelectionContent}
      {sidingSelectionContent}
      <ServicesPanel {...servicesPanelProps} />
      <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />
      {priceSummaryContent}
      {approvalContent}
      {exportContent}
    </div>
  );

  const viewerContent = (
    <div className="viewer-pane" style={{ height: '100%' }}>
      <div className="viewer3d-canvas-wrap">
        <Viewer3D
          ref={viewerRef}
          parsedLayers={parsedLayers}
          layerOffsets={layerOffsets}
          facetColors={facetColors}
          facetLabels={facetLabels}
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
    </div>
  );

  const activeStudioStepIndex = STUDIO_STEPS.findIndex((step) => step.key === activeStudioStep);
  const activeStudioStepLabel = STUDIO_STEPS[activeStudioStepIndex]?.label || STUDIO_STEPS[0].label;
  const xmlRecoveryMessage = parseFailures.length
    ? `${parseFailures.length === 1 ? 'An imported XML layer could' : 'Some imported XML layers could'} not be read. Your design changes are still here; review the Project imports to replace or remove the affected layer${parseFailures.length === 1 ? '' : 's'}.`
    : '';
  const configuratorActive = activeSection === 'configurator' || isCustomerView;
  const handleOpenProjectTools = () => {
    setActiveSection('configurator');
    setExpertRequested(false);
    setActiveStudioStep('project');
    setMobileInspectorOpen(true);
  };
  const legacySectionContent = !isCustomerView && (
    <>
      {activeSection === 'settings' && (
        <SettingsPanel onSaved={setCompanySettings} customServiceCatalog={customServiceCatalog} />
      )}
      {activeSection === 'discounts' && <DiscountsPanel onSaved={setCompanySettings} />}
      {activeSection === 'customServices' && (
        <CustomServicesPanel onChanged={setCustomServiceCatalog} />
      )}
      {activeSection === 'materials' && (
        <MaterialsPanel
          onColorsChanged={(rows) => setExtraColors(rows.map(toColorEntry))}
          onMaterialsChanged={applyMaterialsCatalog}
        />
      )}
    </>
  );

  return (
    <div className="app" style={{ '--brand-accent': brand.accent, '--brand-accent-dark': brand.accentDark }}>
      <StudioShell
        mode={studioMode}
        notice={shellNotice}
        topBar={(
          <>
            {isCustomerView ? (
              <header className="app-header">
                <div className="app-header-brand">
                  {companySettings?.logo_url && <img src={companySettings.logo_url} alt="Company logo" className="app-header-logo" />}
                  <div>
                    <div className="app-title">{brand.name} 3D Configurator</div>
                    <div className="app-subtitle">{brand.tagline} — Job {house.jobNumber} · {house.customerName}</div>
                  </div>
                </div>
                <BrandToggle brandId={brandId} onChange={setBrandId} />
              </header>
            ) : (
              <StudioTopBar
                title={`${brand.name} 3D Configurator`}
                subtitle={`${brand.tagline} — Job ${house.jobNumber} · ${house.customerName}`}
                logoUrl={companySettings?.logo_url}
                projectLabel={house.jobNumber || 'Untitled project'}
                projectStatus={projectSaveStatus}
                projectActions={{
                  onNew: handleNewProject,
                  onOpen: handleOpenProjectTools,
                  onSave: handleSaveProject,
                  onShare: handleExportHtml,
                  canOpen: projectOperations.canOpen,
                  canSave: projectOperations.canSave,
                  canShare: projectOperations.canShare,
                  busy: projectActionBusy,
                  status: projectActionStatus || (
                    (!projectOperations.canSave || !projectOperations.canShare)
                      ? projectOperations.message
                      : ''
                  ),
                }}
                canShowExpert={showExpertControl}
                expertActive={studioMode === 'expert'}
                onToggleExpert={() => {
                  setActiveSection('configurator');
                  setExpertRequested((requested) => !requested);
                }}
                onLogout={handleLogout}
                onOpenNavigation={() => setActiveSection('configurator')}
              />
            )}

            {!isCustomerView && (
              <nav className="app-nav">
                {NAV_SECTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`app-nav-tab${activeSection === key ? ' active' : ''}`}
                    onClick={() => setActiveSection(key)}
                  >
                    {label}
                  </button>
                ))}
                {canViewPlatform && (
                  <button
                    type="button"
                    className={`app-nav-tab${activeSection === 'platform' ? ' active' : ''}`}
                    onClick={() => setActiveSection('platform')}
                  >
                    Platform
                  </button>
                )}
                {canViewPlatform && (
                  <div data-interface-design-placeholder>
                    <button type="button" className="app-nav-tab" disabled>Import Interface Design</button>
                    <span className="control-sublabel">Skin package validation is not enabled in this release.</span>
                  </div>
                )}
              </nav>
            )}
          </>
        )}
        stepRail={configuratorActive && studioMode === 'sales' ? (
          <GuidedStepRail
            steps={STUDIO_STEPS}
            activeStep={activeStudioStep}
            completedSteps={STUDIO_STEPS.slice(0, Math.max(0, activeStudioStepIndex)).map((step) => step.key)}
            onStepChange={setActiveStudioStep}
          />
        ) : null}
        viewer={configuratorActive ? (
          <ViewerWorkspace viewerMode={viewerMode} onViewerModeChange={setViewerMode}>
            {viewerContent}
          </ViewerWorkspace>
        ) : legacySectionContent}
        inspector={configuratorActive ? (
          <ContextInspector
            title={studioMode === 'sales' ? activeStudioStepLabel : 'Design controls'}
            mobileOpen={mobileInspectorOpen}
            onMobileOpenChange={setMobileInspectorOpen}
            error={xmlRecoveryMessage}
            onRetry={parseFailures.length ? handleOpenProjectTools : undefined}
            recoveryLabel="Review project imports"
          >
            <div hidden={studioMode === 'sales' && activeStudioStep !== 'project'}>
              {projectContent}
            </div>
            <div
              data-project-panels
              hidden={studioMode === 'sales' && !['project', 'review'].includes(activeStudioStep)}
            >
              {projectPanelsContent}
            </div>
            {studioMode === 'sales' ? (
              <SalesStepContent
                activeStep={activeStudioStep}
                projectContent={null}
                roofContent={roofContent}
                sidingContent={sidingContent}
                accentsContent={accentsContent}
                servicesContent={servicesContent}
                reviewContent={reviewContent}
              />
            ) : fullControlsContent}
          </ContextInspector>
        ) : null}
        estimateDock={configuratorActive && studioMode === 'sales' ? (
          <EstimateDock
            estimate={estimate}
            activeStep={activeStudioStepLabel}
            atFirstStep={activeStudioStepIndex <= 0}
            atLastStep={activeStudioStepIndex === STUDIO_STEPS.length - 1}
            onPrevious={() => {
              setActiveStudioStep(previousStudioStep(activeStudioStep).key);
              setMobileInspectorOpen(true);
            }}
            onNext={() => {
              setActiveStudioStep(nextStudioStep(activeStudioStep).key);
              setMobileInspectorOpen(true);
            }}
          >
            <strong>
              Total Estimate: {estimate.total.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}
            </strong>
          </EstimateDock>
        ) : null}
        platformContent={canViewPlatform && <PlatformConsole capabilities={capabilities} />}
      />
    </div>
  );
}
