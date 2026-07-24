import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Viewer3D from './components/Viewer3D.jsx';
import ColorPickerButton from './components/ColorPickerButton.jsx';
import ProductSelector from './components/ProductSelector.jsx';
import ExtrasServicesPanel, { ServiceRow } from './components/ExtrasServicesPanel.jsx';
import TrimsPanel from './components/TrimsPanel.jsx';
import PriceSummary from './components/PriceSummary.jsx';
import PhotoOverlayControl from './components/PhotoOverlayControl.jsx';
import AssemblyAdjustment from './components/AssemblyAdjustment.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import CapturePanel from './components/CapturePanel.jsx';
import ProjectsPanel from './components/ProjectsPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import DiscountsPanel from './components/DiscountsPanel.jsx';
import CustomServicesPanel from './components/CustomServicesPanel.jsx';
import MaterialsPanel from './components/MaterialsPanel.jsx';
import AttachmentsPanel from './components/AttachmentsPanel.jsx';
import FacetInspector from './components/FacetInspector.jsx';
import PlatformConsole from './components/PlatformConsole.jsx';
import ContextInspector from './components/ContextInspector.jsx';
import SalesStepContent from './components/SalesStepContent.jsx';
import AdminWorkspaceShell from './components/workspaces/AdminWorkspaceShell.jsx';
import SalesModeShell from './components/workspaces/SalesModeShell.jsx';
import ExpertWorkspaceShell, { ExpertSurfaceInspector } from './components/workspaces/ExpertWorkspaceShell.jsx';
import ShowroomModeShell, {
  buildShowroomMaterials,
  buildShowroomViewModel,
  mergePresentationCatalogOptions,
  PRESENTATION_TRIM_KINDS,
  presentationCatalogOption,
  presentationCatalogOptionFromTrimRecord,
  presentationCategoryForOption,
} from './components/workspaces/ShowroomModeShell.jsx';
import ViewerStage from './components/workspaces/ViewerStage.jsx';
import WorkspaceTopBar from './components/workspaces/WorkspaceTopBar.jsx';
import useWorkspaceController from './hooks/useWorkspaceController.js';
import { parseAppliCadXML, facetKey, collectOpenings, roofSqft, wallSqft } from './lib/roofRulerParser.js';
import { buildFacetLabelMap, labelOpenings } from './lib/facetLabels.js';
import { calculateEstimate } from './lib/pricingEngine.js';
import { buildEstimateText, downloadTextFile } from './lib/exportEstimate.js';
import { buildEstimatePdf } from './lib/exportPdf.js';
import { captureDesignState, applyDesignState, createStableDesignNormalizer, decodeDesignFromUrl } from './lib/designState.js';
import { normalizeCustomServiceLines } from './lib/designState.js';
import { createDesignRuntime } from './lib/designRuntime.js';
import { buildAccountDefaultDesignSnapshot, buildNewProjectDesignSnapshot } from './lib/newProjectDesignState.js';
import { createDeferredDesignApplication, createInitialEditRestore, designFingerprint, getDesignPersistenceState, getProjectOperationState, getProjectSaveStatus, requireAppliedDesign } from './lib/studioDesignState.js';
import { defaultProjectName, downloadProjectFile, saveOrUpdateProject } from './lib/projects.js';
import { replaceEditProjectId } from './lib/projectNavigation.js';
import { urlToDataUrl } from './lib/fileUtils.js';
import { derivePresentationEditable, parsePublicDesignEntry } from './lib/customerContext.js';
import { loadPublicDesignEntry } from './lib/publicProjectLoader.js';
import { buildSelectedCatalogSnapshot, mergeCatalogSnapshots } from './lib/catalogSnapshot.js';
import { buildStandaloneSharePayload, resolveShowroomShareTarget } from './lib/publicShare.js';
import { applySurfaceEdit } from './lib/surfaceOverrides.js';
import { displayMeasurement } from './lib/units.js';
import { canShowExpertControl } from './lib/studioMode.js';
import { parseStudioLayers } from './lib/studioRecovery.js';
import { STUDIO_STEPS } from './lib/studioSteps.js';
import {
  createTrimAccent,
  normalizeTrimAccents,
  productBaseLabel,
  selectLibraryTrimProduct,
  syncTrimAccentsToLegacy,
} from './lib/trimAccents.js';
import { projectExtrasOnly } from './lib/trimServiceBoundary.js';
import { ROOF_PRODUCTS, ROOF_PROFILES, WALL_PRODUCTS, WALL_PROFILES, GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, allRoofProducts, allWallProducts, setExtraMaterials } from './data/pricing.js';
import { allColors, colorById, setExtraColors } from './data/colors.js';
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

const ADMINISTRATIVE_SECTIONS = new Set(['settings', 'discounts', 'customServices', 'materials', 'capture', 'platform']);
export const isAdministrativeSection = (section) => ADMINISTRATIVE_SECTIONS.has(section);

// Maps a materials-table row (snake_case, DB shape) to the plain
// {id, label, pricePerSqft} shape ROOF_PRODUCTS/WALL_PRODUCTS already use,
// so allRoofProducts()/allWallProducts() in data/pricing.js can treat a
// custom material exactly like a baseline one everywhere it's looked up.
function toMaterialProduct(m) {
  return { id: m.id, label: m.name, pricePerSqft: Number(m.price_per_sqft ?? m.pricePerSqft) };
}

// Maps a colors-table row (snake_case, DB shape) to the plain
// {id, code, name, hex, series, thumbnail} shape RAL_COLORS already uses,
// so allColors() in data/colors.js can treat a custom color exactly like a
// baseline one everywhere it's looked up (swatch rendering, formatColorLabel).
function toColorEntry(c) {
  return { id: c.id, code: c.code || '', name: c.name, hex: c.hex, series: c.series, thumbnail: c.thumbnail_url || c.thumbnail || undefined };
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

export function AppWorkspace({
  workspaceState,
  viewerStage,
  salesViewModel,
  expertViewModel,
  showroomViewModel,
}) {
  let shell;
  if (workspaceState.mode === 'showroom') {
    shell = <ShowroomModeShell key="workspace-shell" {...showroomViewModel} embedded viewerStage={null} />;
  } else if (workspaceState.mode === 'expert') {
    shell = <ExpertWorkspaceShell key="workspace-shell" {...expertViewModel} embedded viewerStage={null} />;
  } else {
    shell = <SalesModeShell key="workspace-shell" {...salesViewModel} embedded viewerStage={null} />;
  }

  const safeStateClass = workspaceState.mode === 'showroom' && showroomViewModel.status !== 'ready'
    ? ' showroom-safe-state-workspace'
    : '';
  const detailsStateClass = (workspaceState.mode === 'sales' && salesViewModel.detailsOpen === false)
    || (workspaceState.mode === 'expert' && expertViewModel.detailsOpen === false)
    ? ' is-details-closed'
    : '';
  return (
    <div className={`workspace-root app-workspace-layout ${workspaceState.mode}-workspace${safeStateClass}${detailsStateClass}`} data-studio-skin="ironwrap">
      {shell}
      <div className="app-workspace-persistent-viewer" key="persistent-viewer">
        {viewerStage}
      </div>
    </div>
  );
}

export function openWorkspaceNavigation(mode, event, documentRoot = document) {
  event.preventDefault();
  documentRoot.getElementById(`${mode}-navigation-drawer`)?.showPopover?.();
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
    services: DEFAULT_SERVICES,
  }));
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
  const [publicQuoteTotal, setPublicQuoteTotal] = useState(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [activeSection, setActiveSection] = useState('configurator');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showroomSelectedCategory, setShowroomSelectedCategory] = useState('roof');
  const [showroomSelectedTrimKind, setShowroomSelectedTrimKind] = useState({
    accents: null,
    doors: 'garage_doors',
    gutters: 'gutters',
  });
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(true);
  const [shellNotice, setShellNotice] = useState('');
  const [projectActionStatus, setProjectActionStatus] = useState('');
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [projectListRevision, setProjectListRevision] = useState(0);
  const projectActionStatusTimeoutRef = useRef(null);
  const capabilities = currentUser?.capabilities || [];
  const canViewPlatform = capabilities.includes('platform.diagnostics.read');
  const canCapture = capabilities.includes('capture.create');
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
  const [libraryOptionsSettled, setLibraryOptionsSettled] = useState(false);
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
  const [colorsCatalog, setColorsCatalog] = useState([]);
  const [catalogSnapshot, setCatalogSnapshot] = useState(null);
  const [catalogRenderVersion, setCatalogRenderVersion] = useState(0);
  const applyMaterialsCatalog = (rows) => {
    const catalogRows = Array.isArray(rows) ? rows : [];
    setMaterialsCatalog(catalogRows);
  };
  const applyColorsCatalog = (rows) => {
    const catalogRows = (Array.isArray(rows) ? rows : []).map(toColorEntry);
    setColorsCatalog(catalogRows);
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
  // Selection-only DTO from the authenticated Library adapter. It remains
  // separate from the legacy catalogs above until each consumer migrates.
  const [libraryOptions, setLibraryOptions] = useState({ products: [], services: [] });
  const libraryOptionsRequestRef = useRef(false);
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
  const initialPublicEntryRef = useRef(null);
  if (!initialPublicEntryRef.current) {
    initialPublicEntryRef.current = parsePublicDesignEntry({
      search: window.location.search,
      embeddedDesign: window.__IRONWRAP_DESIGN__ || null,
    });
  }
  const [isCustomerView, setIsCustomerView] = useState(() => Boolean(initialPublicEntryRef.current.kind));
  const [publicEntryState, setPublicEntryState] = useState(initialPublicEntryRef.current);
  const {
    activeExpertTool,
    activeStudioStep,
    cancelPresentation,
    enterPresentationMode,
    exitPresentationMode,
    requestExpert,
    returnToSales,
    setActiveExpertTool,
    setActiveStudioStep,
    workspaceSecurityContext,
    workspaceState,
  } = useWorkspaceController({
    activeSection,
    authenticated: Boolean(currentUser),
    capabilities,
    currentProjectId,
    publicShowroom: isCustomerView,
    role: currentUser?.role || null,
    selectedFacet,
    showExpertMode: companySettings?.show_expert_mode === true,
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

  const activeCatalogSnapshot = useMemo(() => buildSelectedCatalogSnapshot({
    existing: catalogSnapshot,
    materials: materialsCatalog,
    colors: colorsCatalog,
    materialIds: [
      roofProductId,
      wallProductId,
      ...Object.values(facetOverrides).map((override) => override?.productId),
    ],
    colorIds: [
      roofColorId,
      wallColorId,
      ...Object.values(facetOverrides).map((override) => override?.colorId),
      ...trimAccents.map((record) => record.colorId),
      ...trimAccents.flatMap((record) => record.compatibleColorIds ?? []),
    ],
  }), [
    catalogSnapshot, colorsCatalog, facetOverrides, materialsCatalog, roofColorId,
    roofProductId, trimAccents, wallColorId, wallProductId,
  ]);
  const effectiveMaterialsCatalog = useMemo(() => mergeCatalogSnapshots(
    materialsCatalog, activeCatalogSnapshot.materials,
  ), [activeCatalogSnapshot.materials, materialsCatalog]);
  const effectiveColorsCatalog = useMemo(() => mergeCatalogSnapshots(
    colorsCatalog, activeCatalogSnapshot.colors,
  ), [activeCatalogSnapshot.colors, colorsCatalog]);

  // Legacy catalog consumers remain module-backed, but the authoritative
  // source/version is React state. The version update guarantees all memoized
  // consumers rerender after a catalog or frozen snapshot changes.
  useEffect(() => {
    const pricedRows = effectiveMaterialsCatalog.filter((material) => Number.isFinite(Number(
      material.price_per_sqft ?? material.pricePerSqft,
    )));
    setExtraMaterials({
      roof: pricedRows.filter((material) => material.kind !== 'wall').map(toMaterialProduct),
      wall: pricedRows.filter((material) => material.kind === 'wall').map(toMaterialProduct),
    });
    setExtraColors(effectiveColorsCatalog.map(toColorEntry));
    setCatalogRenderVersion((version) => version + 1);
  }, [effectiveColorsCatalog, effectiveMaterialsCatalog]);

  const currentDesignSnapshot = useMemo(
    () => captureDesignState({
      brandId, house, roofProductId, roofProfile, roofColorId,
      wallProductId, wallProfile, wallColorId, services, lockedServices, gutterOptionId, downspoutOptionId,
      measurements, manualDiscount, layerOffsets, accessoryColors, trimAccents,
      uniformFinish, facetOverrides, customServiceLines,
      catalogSnapshot: activeCatalogSnapshot,
      pricingSettings: effectivePricingSettings,
    }),
    [
      accessoryColors, activeCatalogSnapshot, brandId, companySettings, customServiceLines, downspoutOptionId,
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
    if (
      stableDesignNormalizerRef.current
      || isCustomerView
      || !companySettingsSettled
      || !defaultCatalogsSettled
      || !libraryOptionsSettled
    ) return;
    const accountDefaults = buildAccountDefaultDesignSnapshot({
      companySettings,
      customServiceCatalog,
      libraryOptions,
      effectivePricingSettings,
    });
    stableDesignNormalizerRef.current = createStableDesignNormalizer(accountDefaults);
    projectDesignApplicationRef.current.setReady((snapshot) => applyDesignSnapshot(snapshot, false));
    setDesignDefaultsReady(true);
  }, [companySettings, companySettingsSettled, customServiceCatalog, defaultCatalogsSettled, effectivePricingSettings, isCustomerView, libraryOptions, libraryOptionsSettled]);

  const buildDesignSnapshot = () => currentDesignSnapshot;
  const currentDesignFingerprint = useMemo(
    () => designFingerprint(currentDesignSnapshot),
    [currentDesignSnapshot]
  );
  const markDesignPersisted = (design) => {
    if (!design?.pricingSettings && !isCustomerView) return;
    if (design?.pricingSettings) setPricingSettings(design.pricingSettings);
    if (design?.catalogSnapshot) setCatalogSnapshot(design.catalogSnapshot);
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
    setSelectedFacet(null);
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
      setCatalogSnapshot,
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

  // Resolve the public entry once, then run exactly the selected loader. An
  // embedded export takes precedence over ?p=, which takes precedence over
  // legacy ?d=; failures never fall through to a lower-precedence payload.
  useEffect(() => {
    const entry = initialPublicEntryRef.current;
    if (!entry.kind || entry.status === 'invalid') return;
    loadPublicDesignEntry(entry, {
      embeddedDesign: window.__IRONWRAP_DESIGN__ || null,
      embeddedCatalog: window.__IRONWRAP_PUBLIC_CATALOG__ || { colors: [], materials: [] },
      embeddedQuote: window.__IRONWRAP_QUOTE__ || null,
      embeddedRuntime: window.__IRONWRAP_RUNTIME__ || null,
      decodeDesign: decodeDesignFromUrl,
      fetchJson,
    }).then((loaded) => {
      applyColorsCatalog(loaded.catalog?.colors);
      applyMaterialsCatalog(loaded.catalog?.materials);
      setDesignRuntime(loaded.runtime ? createDesignRuntime(loaded.runtime.unitSystem) : null);
      const restoredDesign = requireAppliedDesign(
        applyDesignSnapshot(loaded.design, true),
        'Shared design is unavailable.',
      );
      if (loaded.projectId) {
        setCurrentProjectId(loaded.projectId);
        markDesignPersisted(restoredDesign);
      }
      setApprovedAt(loaded.approvedAt || null);
      setPublicQuoteTotal(Number.isFinite(Number(loaded.quote?.total)) ? Number(loaded.quote.total) : null);
      setPublicEntryState({ ...entry, status: 'ready' });
    }).catch((error) => {
      setPublicEntryState({ ...entry, status: 'error' });
      showLoadNotice('Failed to load public design:', 'We couldn’t open the shared design.', error);
    });
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
        if (!restoredDesign) throw new Error('Saved project design is unavailable.');
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
    if (initialPublicEntryRef.current.kind) {
      setCompanySettingsSettled(true);
      setDefaultCatalogsSettled(true);
      setLibraryOptionsSettled(true);
      return;
    }
    fetchJson('/api/settings')
      .then(setCompanySettings)
      .catch((error) => showLoadNotice('Failed to load account settings:', 'Pricing settings are unavailable. Refresh before saving or sharing this design.', error))
      .finally(() => setCompanySettingsSettled(true));
    fetchJson('/api/auth/me').then(setCompanyProfile).catch((error) => showLoadNotice('Failed to load account profile:', 'Some account details are unavailable. The design tools remain available.', error));
    const defaultCatalogRequests = [
      fetchJson('/api/custom-services').then(setCustomServiceCatalog).catch((error) => showLoadNotice('Failed to load saved service options:', 'Some saved service options are unavailable. Built-in options remain available.', error)),
      fetchJson('/api/colors').then(applyColorsCatalog).catch((error) => showLoadNotice('Failed to load saved color options:', 'Some saved color options are unavailable. Built-in options remain available.', error)),
      fetchJson('/api/materials').then(applyMaterialsCatalog).catch((error) => showLoadNotice('Failed to load saved material options:', 'Some saved material options are unavailable. Built-in options remain available.', error)),
    ];
    Promise.allSettled(defaultCatalogRequests).then(() => setDefaultCatalogsSettled(true));
  }, []);

  useEffect(() => {
    if (!currentUser || initialPublicEntryRef.current.kind) return;
    if (libraryOptionsRequestRef.current) return;
    libraryOptionsRequestRef.current = true;
    fetchJson('/api/custom-services?action=library-options').then(setLibraryOptions)
      .catch((error) => (
        showLoadNotice('Failed to load Library options:', 'Library selections are unavailable. Refresh to try again.', error)
      ))
      .finally(() => setLibraryOptionsSettled(true));
  }, [currentUser]);

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
        roofProducts: [
          ...ROOF_PRODUCTS,
          ...effectiveMaterialsCatalog.filter((material) => material.kind !== 'wall').map(toMaterialProduct),
        ],
        wallProducts: [
          ...WALL_PRODUCTS,
          ...effectiveMaterialsCatalog.filter((material) => material.kind === 'wall').map(toMaterialProduct),
        ],
        roofFaces: roofFacesForPricing,
        wallFaces: wallFacesForPricing,
        facetOverrides: uniformFinish ? {} : extractProductOverrides(facetOverrides),
        services,
        trimAccents,
        gutterOption: gutterOptionId,
        downspoutOption: downspoutOptionId,
        manualDiscount,
        // effectivePricingSettings already resolves "frozen rates from a
        // saved project, else whatever Settings currently says, else
        // undefined for everything" — see its definition above.
        ...(effectivePricingSettings || {}),
        customServiceLines,
      }),
    [measurements, roofProductId, wallProductId, roofFacesForPricing, wallFacesForPricing, uniformFinish, facetOverrides, services, trimAccents, gutterOptionId, downspoutOptionId, manualDiscount, companySettings, pricingSettings, customServiceLines, effectiveMaterialsCatalog, catalogRenderVersion]
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
  }, [roofFacesForPricing, wallFacesForPricing, facetOverrides, roofColorId, wallColorId, uniformFinish, effectiveColorsCatalog, catalogRenderVersion]);

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
      libraryOptions,
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
    if (uniformFinish && workspaceState.mode !== 'expert') return;
    setSelectedFacet(payload);
  };

  const facetOverrideState = selectedFacet ? facetOverrides[selectedFacet.key] : null;
  const facetGlobalProductId = selectedFacet?.role === 'roof' ? roofProductId : wallProductId;
  const facetGlobalColorId = selectedFacet?.role === 'roof' ? roofColorId : wallColorId;

  const setFacetOverride = (patch) => {
    if (!selectedFacet) return;
    setFacetOverrides((prev) => applySurfaceEdit({
      uniformFinish,
      facetOverrides: prev,
      facetKey: selectedFacet.key,
      patch,
    }).facetOverrides);
    setUniformFinish(false);
  };

  const clearFacetOverride = () => {
    if (!selectedFacet) return;
    setFacetOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedFacet.key];
      return next;
    });
  };

  const selectedFacetMeasurement = selectedFacet
    ? displayMeasurement(selectedFacet.sizeSf, 'sqft', effectiveUnitSystem)
    : null;
  const selectedFacetProduct = selectedFacet?.role === 'roof'
    ? allRoofProducts().find((product) => product.id === (facetOverrideState?.productId || facetGlobalProductId))
    : allWallProducts().find((product) => product.id === (facetOverrideState?.productId || facetGlobalProductId));
  const selectedFacetColor = selectedFacet
    ? colorById(facetOverrideState?.colorId || facetGlobalColorId)
    : null;
  const expertSurfaceInspector = (
    <ExpertSurfaceInspector
      surface={selectedFacet ? {
        id: selectedFacet.key,
        identity: `${selectedFacet.role === 'roof' ? 'Roof' : 'Wall'} facet ${selectedFacet.faceId}`,
        measurement: `${selectedFacetMeasurement.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${selectedFacetMeasurement.unit}`,
        pitch: selectedFacet.pitch ? `${selectedFacet.pitch}/12 pitch` : undefined,
      } : null}
      material={selectedFacetProduct ? { id: selectedFacetProduct.id, label: selectedFacetProduct.label } : null}
      color={selectedFacetColor ? { id: selectedFacetColor.id, label: selectedFacetColor.name } : null}
      hasOverride={Boolean(facetOverrideState)}
      editor={selectedFacet ? (
        <FacetInspector
          facet={selectedFacet}
          effectiveProductId={facetOverrideState?.productId || facetGlobalProductId}
          effectiveColorId={facetOverrideState?.colorId || facetGlobalColorId}
          hasOverride={Boolean(facetOverrideState)}
          onProductChange={(id) => setFacetOverride({ productId: id })}
          onColorChange={(id) => setFacetOverride({ colorId: id })}
          onClear={clearFacetOverride}
          onClose={() => setSelectedFacet(null)}
          unitSystem={effectiveUnitSystem}
        />
      ) : null}
    />
  );

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
      unitSystem: effectiveUnitSystem,
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
      const sharePayload = buildStandaloneSharePayload({
        applicationUrl: new URL(window.location.pathname, window.location.origin).toString(),
        projectId: saved?.id,
        design: state,
        colors: effectiveColorsCatalog,
        materials: effectiveMaterialsCatalog,
        total: estimate.total,
        runtime: createDesignRuntime(effectiveUnitSystem),
      });

      // Escape "</script>" sequences that could appear inside string values
      // (e.g. a customer name) so they can't break out of the inline script.
      const stateJson = JSON.stringify(sharePayload.design).replace(/</g, '\\u003c');
      const runtimeJson = JSON.stringify(sharePayload.runtime).replace(/</g, '\\u003c');
      const catalogJson = JSON.stringify(sharePayload.catalog).replace(/</g, '\\u003c');
      const quoteJson = JSON.stringify(sharePayload.quote).replace(/</g, '\\u003c');
      const applicationUrlJson = JSON.stringify(sharePayload.applicationUrl);
      const originJson = JSON.stringify(new URL(sharePayload.applicationUrl).origin);
      const stateScript = `<script>window.__IRONWRAP_DESIGN__ = ${stateJson}; window.__IRONWRAP_RUNTIME__ = ${runtimeJson}; window.__IRONWRAP_PUBLIC_CATALOG__ = ${catalogJson}; window.__IRONWRAP_QUOTE__ = ${quoteJson}; window.__IRONWRAP_APPLICATION_URL__ = ${applicationUrlJson}; window.__IRONWRAP_ORIGIN__ = ${originJson};</script>\n`;
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
      unitSystem: effectiveUnitSystem,
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
          onOperationBusyChange={setProjectActionBusy}
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
        unitSystem={effectiveUnitSystem}
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
        unitSystem={effectiveUnitSystem}
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

  const extraServices = projectExtrasOnly(services);
  const extraLockedServices = projectExtrasOnly(lockedServices);
  const handleExtraServicesChange = (nextExtraServices) => setServices((current) => ({
    ...current,
    ...projectExtrasOnly(nextExtraServices),
  }));
  const handleExtraLockedServicesChange = (nextExtraLocks) => setLockedServices((current) => ({
    ...current,
    ...projectExtrasOnly(nextExtraLocks),
  }));
  const trimsContent = (
    <TrimsPanel
      records={trimAccents}
      libraryOptions={libraryOptions.products}
      onChange={handleTrimAccentsChange}
      unitSystem={effectiveUnitSystem}
      readOnly={isCustomerView}
      isCustomerView={isCustomerView}
      gutterOptionId={gutterOptionId}
      onGutterOptionChange={setGutterOptionId}
      downspoutOptionId={downspoutOptionId}
      onDownspoutOptionChange={setDownspoutOptionId}
    />
  );
  const extrasServicesContent = (
    <ExtrasServicesPanel
      services={extraServices}
      onServicesChange={handleExtraServicesChange}
      lockedServices={extraLockedServices}
      onLockedServicesChange={handleExtraLockedServicesChange}
      measurements={measurements}
      onMeasurementsChange={setMeasurements}
      readOnlyQuantities={isCustomerView}
      isCustomerView={isCustomerView}
      customServiceLines={customServiceLines}
      onCustomServiceLinesChange={handleCustomServiceLinesChange}
      customServiceCatalog={customServiceCatalog}
      libraryOptions={libraryOptions.services}
      unitSystem={effectiveUnitSystem}
    />
  );

  const servicesContent = extrasServicesContent;

  const accentsContent = (
    <>
      {trimsContent}
      <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />
    </>
  );

  const priceSummaryContent = (
    <PriceSummary
      estimate={estimate}
      manualDiscount={manualDiscount}
      onManualDiscountChange={setManualDiscount}
      readOnlyDiscount={isCustomerView}
      unitSystem={effectiveUnitSystem}
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
      {trimsContent}
      {extrasServicesContent}
      <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />
      {priceSummaryContent}
      {approvalContent}
      {exportContent}
    </div>
  );

  const sharedViewer = (
    <div className="viewer-pane" style={{ height: '100%' }}>
      <div className="viewer3d-canvas-wrap">
        <Viewer3D
          ref={viewerRef}
          parsedLayers={parsedLayers}
          layerOffsets={layerOffsets}
          facetColors={facetColors}
          facetLabels={facetLabels}
          photoOverlay={photoOverlay}
          facetSelectionEnabled={workspaceState.mode === 'expert'
            ? activeExpertTool === 'select'
            : workspaceState.mode !== 'showroom' && !uniformFinish}
          selectedFacetId={workspaceState.mode === 'showroom' ? null : selectedFacet?.key}
          onFacetClick={workspaceState.mode === 'expert' && activeExpertTool !== 'select'
            ? undefined
            : workspaceState.mode === 'showroom' ? undefined : handleFacetClick}
        />
        {workspaceState.mode === 'sales' && !uniformFinish && (
          <FacetInspector
            facet={selectedFacet}
            effectiveProductId={facetOverrideState?.productId || facetGlobalProductId}
            effectiveColorId={facetOverrideState?.colorId || facetGlobalColorId}
            hasOverride={!!facetOverrideState}
            onProductChange={(id) => setFacetOverride({ productId: id })}
            onColorChange={(id) => setFacetOverride({ colorId: id })}
            onClear={clearFacetOverride}
            onClose={() => setSelectedFacet(null)}
            unitSystem={effectiveUnitSystem}
          />
        )}
        {workspaceState.mode !== 'showroom' && (
          <AssemblyAdjustment
            layers={house.layers}
            layerOffsets={layerOffsets}
            activeLayerId={activeLayerId}
            onActiveLayerChange={setActiveLayerId}
            onChange={handleLayerOffsetChange}
            onReset={handleResetLayerOffset}
            unitSystem={effectiveUnitSystem}
          />
        )}
      </div>
    </div>
  );

  const activeStudioStepLabel = STUDIO_STEPS.find((step) => step.key === activeStudioStep)?.label || STUDIO_STEPS[0].label;
  const xmlRecoveryMessage = parseFailures.length
    ? `${parseFailures.length === 1 ? 'An imported XML layer could' : 'Some imported XML layers could'} not be read. Your design changes are still here; review the Project imports to replace or remove the affected layer${parseFailures.length === 1 ? '' : 's'}.`
    : '';
  const configuratorActive = activeSection === 'configurator';
  const administrativeWorkspace = !isCustomerView && isAdministrativeSection(activeSection);
  const handleOpenProjectTools = () => {
    setActiveSection('configurator');
    returnToSales();
    setActiveStudioStep('project');
    setMobileInspectorOpen(true);
  };
  const handlePresentToCustomer = () => {
    try {
      enterPresentationMode();
    } catch {
      setShellNotice('Presentation is unavailable for this workspace.');
    }
  };
  const handleExitPresentation = () => {
    try {
      const restoredWorkspace = exitPresentationMode();
      if (!restoredWorkspace) return;
      setActiveSection('configurator');
    } catch {
      // The verified context changed while presenting; fall back to the
      // normal mode resolver without ever restoring a forged private state.
      cancelPresentation();
      returnToSales();
    }
  };
  const showroomShareTarget = resolveShowroomShareTarget({
    applicationUrl: window.__IRONWRAP_APPLICATION_URL__
      || new URL(window.location.pathname, window.location.origin).toString(),
    projectId: currentProjectId,
    currentUrl: window.location.href,
    standalone: Boolean(window.__IRONWRAP_DESIGN__),
  });
  const handleShowroomShare = async () => {
    const { url } = showroomShareTarget;
    if (!url) {
      setShellNotice(showroomShareTarget.unavailableReason);
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'IronWrap design', url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShellNotice('Share link copied.');
      } else {
        window.prompt('Copy this share link', url);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        showLoadNotice('Failed to share Showroom link:', 'The share link could not be copied. Please copy it from your browser.', error);
      }
    }
  };
  const authenticatedPresentation = workspaceState.presentationSource === 'authenticated';
  const presentationEditable = derivePresentationEditable({
    currentUser,
    isCustomerView,
    session: workspaceState,
  });
  const administrativeContent = !isCustomerView && (
    <>
      {activeSection === 'settings' && (
        <SettingsPanel
          onSaved={setCompanySettings}
          customServiceCatalog={customServiceCatalog}
          libraryOptions={libraryOptions}
        />
      )}
      {activeSection === 'discounts' && <DiscountsPanel onSaved={setCompanySettings} />}
      {activeSection === 'customServices' && (
        <CustomServicesPanel onChanged={setCustomServiceCatalog} />
      )}
      {activeSection === 'materials' && (
        <MaterialsPanel
          onColorsChanged={applyColorsCatalog}
          onMaterialsChanged={applyMaterialsCatalog}
        />
      )}
      {activeSection === 'capture' && canCapture && (
        <CapturePanel canReview={capabilities.includes('capture.review')} />
      )}
      {activeSection === 'platform' && canViewPlatform && (
        <PlatformConsole capabilities={capabilities} />
      )}
    </>
  );
  const showroomViewModel = useMemo(() => {
    const categories = [
      { key: 'roof', label: 'Roof', available: hasRoofFaces, unavailableReason: 'No roof surfaces in this model' },
      { key: 'siding', label: 'Siding', available: hasWallFaces, unavailableReason: 'No siding surfaces in this model' },
      { key: 'accents', label: 'Accents', available: false, unavailableReason: 'Accent geometry is not available in this 3D model; estimate selections are still editable.' },
      { key: 'doors', label: 'Doors', available: false, unavailableReason: 'Door finishes are not rendered separately in this 3D model; estimate selections are still editable.' },
      { key: 'gutters', label: 'Gutters', available: false, unavailableReason: 'Gutter geometry is not available in this 3D model; estimate selections are still editable.' },
    ];
    const selectedCategory = categories.find((category) => category.key === showroomSelectedCategory)
      ?? categories[0];
    const categoryIsRenderable = (showroomSelectedCategory === 'roof' && hasRoofFaces)
      || (showroomSelectedCategory === 'siding' && hasWallFaces);

    const materialKindById = new Map(effectiveMaterialsCatalog.map((material) => [
      material.id,
      material.kind === 'wall' ? 'wall' : 'roof',
    ]));
    const materialById = new Map(effectiveMaterialsCatalog.map((material) => [material.id, material]));
    const rawProductOptions = [
      ...allRoofProducts().map((product) => presentationCatalogOption(product, 'roof', {
        source: materialById.get(product.id) ? 'material' : 'built-in',
        profiles: ROOF_PROFILES[product.id] ?? materialById.get(product.id)?.profiles ?? [],
        colorIds: materialById.get(product.id)?.colorIds ?? [],
      })),
      ...allWallProducts().map((product) => presentationCatalogOption(product, 'siding', {
        source: materialById.get(product.id) ? 'material' : 'built-in',
        profiles: WALL_PROFILES[product.id] ?? materialById.get(product.id)?.profiles ?? [],
        colorIds: materialById.get(product.id)?.colorIds ?? [],
      })),
      ...libraryOptions.products.flatMap((option) => {
        const category = presentationCategoryForOption(option, materialKindById);
        return category ? [presentationCatalogOption(option, category)] : [];
      }),
      ...GUTTER_OPTIONS.map((option) => presentationCatalogOption(option, 'gutters', {
        source: 'built-in',
        trimKind: 'gutters',
        unit: 'LF',
      })),
      ...DOWNSPOUT_OPTIONS.map((option) => presentationCatalogOption(option, 'gutters', {
        source: 'built-in',
        trimKind: 'downspouts',
        unit: 'LF',
      })),
      ...trimAccents.flatMap((record) => {
        const option = presentationCatalogOptionFromTrimRecord(record);
        return option ? [option] : [];
      }),
    ];
    const productOptions = mergePresentationCatalogOptions(rawProductOptions);
    const productOptionMap = new Map(productOptions.map((option) => [
      `${option.category}:${option.id}`,
      option,
    ]));
    const categoryTrimKinds = PRESENTATION_TRIM_KINDS[showroomSelectedCategory];
    const categoryTrimRecords = categoryTrimKinds
      ? trimAccents.filter((record) => categoryTrimKinds.has(record.kind))
      : [];
    const preferredTrimKind = showroomSelectedTrimKind[showroomSelectedCategory];
    const selectedTrimRecord = categoryTrimRecords.find((record) => (
      record.kind === preferredTrimKind && record.selected && record.productId
    ))
      ?? categoryTrimRecords.find((record) => record.kind === preferredTrimKind && record.selected)
      ?? categoryTrimRecords.find((record) => record.selected && record.productId)
      ?? categoryTrimRecords.find((record) => record.selected)
      ?? categoryTrimRecords[0];
    const selectedProductId = showroomSelectedCategory === 'roof'
      ? services.roof === false ? undefined : roofProductId
      : showroomSelectedCategory === 'siding'
        ? services.wall === false ? undefined : wallProductId
        : selectedTrimRecord?.selected === false ? undefined : selectedTrimRecord?.productId;
    const selectedProfile = showroomSelectedCategory === 'roof'
      ? roofProfile
      : showroomSelectedCategory === 'siding' ? wallProfile : selectedTrimRecord?.profile;
    const selectedColorId = showroomSelectedCategory === 'roof'
      ? roofColorId
      : showroomSelectedCategory === 'siding' ? wallColorId : selectedTrimRecord?.colorId;
    const selectedProductOption = productOptionMap.get(`${showroomSelectedCategory}:${selectedProductId}`);
    const applicableColorIds = selectedProductOption?.colorIds?.length
      ? selectedProductOption.colorIds
      : effectiveMaterialsCatalog.find((material) => material.id === selectedProductId)?.colorIds;
    const categoryCanChooseFinish = categoryIsRenderable
      || (presentationEditable && Boolean(selectedProductId));
    const showroomColors = categoryCanChooseFinish
      ? applicableColorIds?.length
        ? allColors().filter((color) => applicableColorIds.includes(color.id))
        : allColors()
      : [];

    const replaceSelectedTrim = (patch) => {
      if (!selectedTrimRecord) return;
      handleTrimAccentsChange(trimAccents.map((record) => (
        record.id === selectedTrimRecord.id ? createTrimAccent({
          ...record,
          baseProductLabel: productBaseLabel(selectedTrimRecord.productLabel, selectedTrimRecord.profile),
          ...patch,
        }) : record
      )));
    };
    const addOrSelectProduct = (optionId) => {
      const option = productOptionMap.get(`${showroomSelectedCategory}:${optionId}`);
      if (!option) return;
      if (showroomSelectedCategory === 'roof') {
        handleRoofProductChange(option.id);
        if (!ROOF_PROFILES[option.id]?.length) setRoofProfile(option.profiles?.[0] || '');
        setServices((current) => ({ ...current, roof: true }));
        return;
      }
      if (showroomSelectedCategory === 'siding') {
        handleWallProductChange(option.id);
        if (!WALL_PROFILES[option.id]?.length) setWallProfile(option.profiles?.[0] || '');
        setServices((current) => ({ ...current, wall: true }));
        return;
      }
      if (!option.trimKind) return;
      setShowroomSelectedTrimKind((current) => ({
        ...current,
        [showroomSelectedCategory]: option.trimKind,
      }));
      const nextRecords = selectLibraryTrimProduct(trimAccents, option, {
        quantities: {
          soffit: measurements.soffitSqft,
          fascia: measurements.fasciaLf,
          gutters: measurements.gutterLf,
          downspouts: measurements.downspoutLf,
          garage_doors: measurements.garageDoorCappingLf,
          other_trims: measurements.capFlashingLf,
        },
      });
      if (option.trimKind === 'gutters' && GUTTER_OPTIONS.some((gutter) => gutter.id === option.id)) {
        setGutterOptionId(option.id);
      }
      if (option.trimKind === 'downspouts' && DOWNSPOUT_OPTIONS.some((downspout) => downspout.id === option.id)) {
        setDownspoutOptionId(option.id);
      }
      handleTrimAccentsChange(nextRecords);
    };
    const removeProduct = () => {
      if (showroomSelectedCategory === 'roof') {
        setServices((current) => ({ ...current, roof: false }));
      } else if (showroomSelectedCategory === 'siding') {
        setServices((current) => ({ ...current, wall: false }));
      } else if (selectedTrimRecord?.customLabel !== undefined) {
        handleTrimAccentsChange(trimAccents.filter((record) => record.id !== selectedTrimRecord.id));
      } else if (selectedTrimRecord) {
        replaceSelectedTrim({ selected: false });
      }
    };
    const changeProfile = (profile) => {
      if (showroomSelectedCategory === 'roof') setRoofProfile(profile);
      else if (showroomSelectedCategory === 'siding') setWallProfile(profile);
      else replaceSelectedTrim({ profile });
    };
    const changeColor = (colorId) => {
      if (showroomSelectedCategory === 'roof') setRoofColorId(colorId);
      else if (showroomSelectedCategory === 'siding') setWallColorId(colorId);
      else replaceSelectedTrim({ colorId });
    };

    return buildShowroomViewModel({
      categories,
      selectedCategory: showroomSelectedCategory,
      onCategoryChange: setShowroomSelectedCategory,
      materials: buildShowroomMaterials({
        colors: showroomColors,
        allowedColorIds: applicableColorIds,
        selectedColorId,
        onSelect: presentationEditable ? changeColor : undefined,
      }),
      estimate: {
        label: 'Estimated project total',
        displayTotal: (isCustomerView && publicQuoteTotal != null ? publicQuoteTotal : estimate.total)
          .toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }),
        qualifier: approvedAt
          ? `Approved on ${new Date(approvedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.`
          : 'Final pricing follows an on-site review.',
      },
      customerActions: {
        onApprove: isCustomerView && currentProjectId && !approvedAt ? handleApproveDesign : undefined,
        onShare: isCustomerView
          ? showroomShareTarget.url ? handleShowroomShare : undefined
          : projectOperations.canShare ? handleExportHtml : undefined,
        shareUnavailableReason: isCustomerView ? showroomShareTarget.unavailableReason : undefined,
      },
      presentationEditable: !isCustomerView && presentationEditable,
      presentationControls: presentationEditable ? {
        selectedCategory: showroomSelectedCategory,
        selectedProductId,
        selectedProfile,
        selectedColorId,
        unavailableReason: selectedCategory.available === false
          ? selectedCategory.unavailableReason
          : undefined,
        productOptions,
        profileOptions: selectedProductOption?.profiles ?? [],
        onProductChange: addOrSelectProduct,
        onProfileChange: changeProfile,
        onRemoveProduct: removeProduct,
        onRemoveProfile: () => changeProfile(''),
        onRemoveColor: () => changeColor(''),
      } : undefined,
    });
  }, [approvedAt, catalogRenderVersion, currentProjectId, effectiveMaterialsCatalog, estimate.total, hasRoofFaces, hasWallFaces, isCustomerView, libraryOptions.products, measurements.capFlashingLf, measurements.downspoutLf, measurements.fasciaLf, measurements.garageDoorCappingLf, measurements.gutterLf, measurements.soffitSqft, presentationEditable, publicQuoteTotal, roofColorId, roofProductId, roofProfile, services.roof, services.wall, showroomSelectedCategory, showroomSelectedTrimKind, showroomShareTarget.unavailableReason, showroomShareTarget.url, trimAccents, wallColorId, wallProductId, wallProfile]);
  const sharedViewerStage = (
    <ViewerStage
      mode={workspaceState.mode}
      viewer={sharedViewer}
      notice={shellNotice}
    />
  );
  const activeControlContent = configuratorActive
    ? workspaceState.mode === 'sales'
      ? (
        <SalesStepContent
          activeStep={activeStudioStep}
          projectContent={null}
          roofContent={roofContent}
          sidingContent={sidingContent}
          accentsContent={accentsContent}
          servicesContent={servicesContent}
          reviewContent={reviewContent}
        />
      )
      : fullControlsContent
    : administrativeContent;
  const sharedInspector = (
    <ContextInspector
      title={configuratorActive ? activeStudioStepLabel : 'Application tools'}
      mobileOpen={mobileInspectorOpen}
      onMobileOpenChange={setMobileInspectorOpen}
      error={configuratorActive ? xmlRecoveryMessage : ''}
      onRetry={configuratorActive && parseFailures.length ? handleOpenProjectTools : undefined}
      recoveryLabel="Review project imports"
    >
      <div hidden={!configuratorActive || (workspaceState.mode === 'sales' && activeStudioStep !== 'project')}>
        {projectContent}
      </div>
      <div
        data-project-panels
        hidden={!configuratorActive || (workspaceState.mode === 'sales' && !['project', 'review'].includes(activeStudioStep))}
      >
        {projectPanelsContent}
      </div>
      {activeControlContent}
    </ContextInspector>
  );
  const handleApplicationSectionChange = (key) => {
    setActiveSection(key);
    returnToSales();
    setMobileInspectorOpen(true);
  };
  const handleCloseAdministration = () => {
    setActiveSection('configurator');
    if (workspaceState.presentationSource !== 'authenticated') returnToSales();
    setMobileInspectorOpen(true);
  };
  const handleOpenWorkspaceNavigation = (event) => {
    openWorkspaceNavigation(workspaceState.mode, event);
  };
  const handleOpenAdminNavigation = (event) => {
    openWorkspaceNavigation('admin', event);
  };
  const applicationNavigation = (
    <>
      {NAV_SECTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-current={activeSection === key ? 'page' : undefined}
          onClick={() => handleApplicationSectionChange(key)}
        >
          {label}
        </button>
      ))}
      {canCapture && (
        <button
          type="button"
          aria-current={activeSection === 'capture' ? 'page' : undefined}
          onClick={() => handleApplicationSectionChange('capture')}
        >
          Capture
        </button>
      )}
      {canViewPlatform && (
        <button
          type="button"
          aria-current={activeSection === 'platform' ? 'page' : undefined}
          onClick={() => handleApplicationSectionChange('platform')}
        >
          Platform
        </button>
      )}
      {showExpertControl && workspaceState.mode === 'sales' && (
        <button
          type="button"
          aria-pressed={false}
          onClick={() => {
            setActiveSection('configurator');
            requestExpert();
          }}
        >
          Expert mode
        </button>
      )}
      {canViewPlatform && (
        <span data-interface-design-placeholder>
          <button type="button" disabled>Import Interface Design</button>
          <span className="control-sublabel">Skin package validation is not enabled in this release.</span>
        </span>
      )}
      {projectActionStatus && <span role="status" aria-live="polite">{projectActionStatus}</span>}
    </>
  );
  const closeProjectMenuAndRun = (action) => {
    setProjectMenuOpen(false);
    return action();
  };
  const applicationTopBar = (
    <WorkspaceTopBar
      mode={workspaceState.mode}
      logoUrl={companySettings?.logo_url}
      navigation={applicationNavigation}
      project={{
        workspaceLabel: `${brand.name} · ${house.jobNumber || 'Untitled project'}`,
        label: `${house.jobNumber || 'Untitled project'} · ${projectSaveStatus}`,
        menuId: 'workspace-project-actions',
        menuOpen: projectMenuOpen,
        onMenuToggle: setProjectMenuOpen,
        onMenuClose: setProjectMenuOpen,
        menu: (
          <>
            <button role="menuitem" type="button" onClick={() => closeProjectMenuAndRun(handleOpenProjectTools)} disabled={projectActionBusy || !projectOperations.canOpen}>Open Project</button>
            <button role="menuitem" type="button" onClick={() => closeProjectMenuAndRun(handleSaveProject)} disabled={projectActionBusy || !projectOperations.canSave}>Save / Download</button>
            <button role="menuitem" type="button" onClick={() => closeProjectMenuAndRun(handleExportHtml)} disabled={projectActionBusy || !projectOperations.canShare}>Share Design</button>
          </>
        ),
      }}
      actions={{
        busy: projectActionBusy,
        onNew: handleNewProject,
      }}
      account={{
        label: 'Account',
        menuId: 'workspace-account-actions',
        menuOpen: accountMenuOpen,
        onMenuToggle: setAccountMenuOpen,
        onMenuClose: setAccountMenuOpen,
        menu: <button role="menuitem" type="button" onClick={handleLogout}>Log out</button>,
      }}
      onPresent={workspaceState.mode === 'sales' && configuratorActive ? handlePresentToCustomer : undefined}
    />
  );
  const salesViewModel = {
    topBar: applicationTopBar,
    detailsOpen: mobileInspectorOpen,
    steps: STUDIO_STEPS,
    activeStep: activeStudioStep,
    onStepChange: setActiveStudioStep,
    inspector: sharedInspector,
    estimate: {
      content: (
        <strong>
          Total Estimate: {estimate.total.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}
        </strong>
      ),
      nextReady: true,
    },
    onPrevious: (targetStep) => {
      setActiveStudioStep(targetStep);
      setMobileInspectorOpen(true);
    },
    onNext: (targetStep) => {
      setActiveStudioStep(targetStep);
      setMobileInspectorOpen(true);
    },
    onOpenNavigation: handleOpenWorkspaceNavigation,
  };
  const expertViewModel = {
    expertEntitled: workspaceSecurityContext.expertEntitled,
    showExpertMode: workspaceSecurityContext.showExpertMode,
    topBar: applicationTopBar,
    detailsOpen: Boolean(selectedFacet),
    activeTool: activeExpertTool,
    onToolChange: setActiveExpertTool,
    surfaceInspector: expertSurfaceInspector,
    estimate: estimate.total.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }),
    onUpdateEstimate: () => setShellNotice('The estimate is up to date.'),
    onReturnToSales: returnToSales,
    onPresent: handlePresentToCustomer,
    onOpenNavigation: handleOpenWorkspaceNavigation,
  };
  const showroomShellViewModel = {
    sessionType: authenticatedPresentation ? 'authenticated-presentation' : 'public',
    categories: showroomViewModel.categories,
    selectedCategory: showroomViewModel.selectedCategory,
    onCategoryChange: showroomViewModel.onCategoryChange,
    materials: showroomViewModel.materials,
    estimate: showroomViewModel.estimate,
    customerActions: showroomViewModel.customerActions,
    presentationEditable: !isCustomerView && presentationEditable,
    ...(presentationEditable ? { presentationControls: showroomViewModel.presentationControls } : {}),
    onExitPresentation: authenticatedPresentation ? handleExitPresentation : undefined,
    status: isCustomerView ? publicEntryState.status : 'ready',
    errorMessage: publicEntryState.status === 'invalid'
      ? 'This shared design link is invalid.'
      : 'This shared design is unavailable. Please contact the contractor.',
  };

  return (
    <div className="app" style={{ '--brand-accent': brand.accent, '--brand-accent-dark': brand.accentDark }}>
      {administrativeWorkspace ? (
        <div className="workspace-root admin-workspace" data-studio-skin="ironwrap">
          <AdminWorkspaceShell
            title={NAV_SECTIONS.find(({ key }) => key === activeSection)?.label
              || (activeSection === 'capture' ? 'Capture' : 'Platform')}
            onClose={handleCloseAdministration}
            topBar={applicationTopBar}
            onOpenNavigation={handleOpenAdminNavigation}
          >
            {administrativeContent}
          </AdminWorkspaceShell>
        </div>
      ) : (
        <AppWorkspace
          workspaceState={workspaceState}
          viewerStage={isCustomerView && publicEntryState.status !== 'ready' ? null : sharedViewerStage}
          salesViewModel={salesViewModel}
          expertViewModel={expertViewModel}
          showroomViewModel={showroomShellViewModel}
        />
      )}
    </div>
  );
}
