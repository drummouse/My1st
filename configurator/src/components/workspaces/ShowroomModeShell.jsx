import ShowroomCategoryRail from './ShowroomCategoryRail.jsx';
import MobileWorkspaceHeader from './MobileWorkspaceHeader.jsx';

const SESSION_TYPES = new Set(['authenticated-presentation', 'public']);
const asCallback = (value) => (typeof value === 'function' ? value : undefined);
const asText = (value) => (
  typeof value === 'string' || typeof value === 'number' ? value : undefined
);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

export const PRESENTATION_TRIM_KINDS = Object.freeze({
  accents: new Set(['soffit', 'fascia', 'other_trims']),
  doors: new Set(['garage_doors']),
  gutters: new Set(['gutters', 'downspouts']),
});

const PRESENTATION_CATEGORY_BY_TRIM_KIND = Object.freeze(
  Object.fromEntries(Object.entries(PRESENTATION_TRIM_KINDS).flatMap(([category, kinds]) => (
    [...kinds].map((kind) => [kind, category])
  ))),
);

const stringList = (value) => (Array.isArray(value)
  ? value.filter((item) => typeof item === 'string' && item.length > 0)
  : []);

const finiteUnitPrice = (value) => {
  if (value == null) return value;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

export function presentationCategoryForOption(option, materialKindById = new Map()) {
  const materialKind = materialKindById.get(option?.id);
  if (materialKind) return materialKind === 'wall' ? 'siding' : 'roof';
  return PRESENTATION_CATEGORY_BY_TRIM_KIND[option?.trimKind] ?? null;
}

export function presentationCatalogOption(option, category, overrides = {}) {
  const enriched = { ...option, ...overrides };
  const explicitUnitPrice = hasOwn(enriched, 'unitPrice')
    ? enriched.unitPrice
    : enriched.pricePerSqft ?? enriched.pricePerLf;
  return {
    id: enriched?.id,
    label: enriched?.label ?? enriched?.name,
    source: enriched?.source ?? 'catalog',
    kind: enriched?.kind ?? 'product',
    category,
    profileLabel: enriched?.profileLabel,
    profiles: stringList(enriched?.profiles).length
      ? stringList(enriched.profiles)
      : enriched?.profileLabel ? [enriched.profileLabel] : [],
    colorIds: stringList(enriched?.colorIds ?? enriched?.color_ids),
    trimKind: enriched?.trimKind,
    unit: enriched?.unit,
    unitPrice: finiteUnitPrice(explicitUnitPrice),
    active: enriched?.active !== false,
    snapshot: enriched?.snapshot === true,
  };
}

export function presentationCatalogOptionFromTrimRecord(record) {
  const category = PRESENTATION_CATEGORY_BY_TRIM_KIND[record?.kind] ?? null;
  if (!category || !record?.productId) return null;
  return presentationCatalogOption({
    id: record.productId,
    label: record.productLabel || record.customLabel || record.productId,
    source: record.source || 'snapshot',
    kind: 'product',
    trimKind: record.kind,
    profileLabel: record.profile || undefined,
    profiles: stringList(record.profileOptions).length
      ? record.profileOptions
      : record.profile ? [record.profile] : [],
    colorIds: stringList(record.compatibleColorIds).length
      ? record.compatibleColorIds
      : record.colorId ? [record.colorId] : [],
    unit: record.unit,
    unitPrice: record.unitPrice,
    snapshot: true,
  }, category);
}

export function mergePresentationCatalogOptions(options = []) {
  const merged = new Map();
  for (const rawOption of Array.isArray(options) ? options : []) {
    const option = {
      id: rawOption?.id,
      label: rawOption?.label ?? rawOption?.name,
      category: rawOption?.category,
      source: rawOption?.source,
      kind: rawOption?.kind,
      profileLabel: rawOption?.profileLabel,
      profiles: stringList(rawOption?.profiles).length
        ? stringList(rawOption.profiles)
        : rawOption?.profileLabel ? [rawOption.profileLabel] : [],
      colorIds: stringList(rawOption?.colorIds ?? rawOption?.color_ids),
      trimKind: rawOption?.trimKind,
      unit: rawOption?.unit,
      unitPrice: finiteUnitPrice(hasOwn(rawOption, 'unitPrice')
        ? rawOption.unitPrice
        : rawOption?.pricePerSqft ?? rawOption?.pricePerLf),
      active: rawOption?.active !== false,
    };
    if (!option.id || !option.label || !option.category || !option.active) continue;
    const key = `${option.category}:${option.id}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, option);
      continue;
    }
    const snapshotPrice = rawOption?.snapshot === true && option.unitPrice != null;
    merged.set(key, {
      ...current,
      kind: current.kind ?? option.kind,
      profileLabel: current.profileLabel ?? option.profileLabel,
      profiles: current.profiles.length ? current.profiles : option.profiles,
      colorIds: current.colorIds.length ? current.colorIds : option.colorIds,
      trimKind: current.trimKind ?? option.trimKind,
      unit: current.unit ?? option.unit,
      unitPrice: snapshotPrice ? option.unitPrice : current.unitPrice ?? option.unitPrice,
    });
  }
  return [...merged.values()];
}

const buildCategory = (category) => ({
  key: asText(category?.key),
  label: asText(category?.label),
  available: category?.available !== false,
  unavailableReason: category?.available === false ? asText(category?.unavailableReason) : undefined,
});

const buildMaterial = (material) => ({
  id: asText(material?.id),
  label: asText(material?.label),
  color: asText(material?.color),
  thumbnail: asText(material?.thumbnail),
  description: asText(material?.description),
  selected: material?.selected === true,
  onSelect: asCallback(material?.onSelect),
});

const buildProductOption = (option) => ({
  id: asText(option?.id),
  label: asText(option?.label),
  source: asText(option?.source),
  kind: asText(option?.kind),
  category: asText(option?.category),
  profileLabel: asText(option?.profileLabel),
  trimKind: asText(option?.trimKind),
  profiles: (Array.isArray(option?.profiles) ? option.profiles : [])
    .filter((profile) => typeof profile === 'string'),
  colorIds: (Array.isArray(option?.colorIds) ? option.colorIds : [])
    .filter((colorId) => typeof colorId === 'string'),
  active: option?.active !== false,
});

function buildPresentationControls(controls, selectedCategory) {
  const category = asText(controls?.selectedCategory) ?? selectedCategory;
  return {
    selectedCategory: category,
    selectedProductId: asText(controls?.selectedProductId),
    selectedProfile: asText(controls?.selectedProfile),
    selectedColorId: asText(controls?.selectedColorId),
    unavailableReason: asText(controls?.unavailableReason),
    productOptions: (Array.isArray(controls?.productOptions) ? controls.productOptions : [])
      .map(buildProductOption)
      .filter((option) => option.active && option.category === category),
    profileOptions: (Array.isArray(controls?.profileOptions) ? controls.profileOptions : [])
      .filter((profile) => typeof profile === 'string'),
    onProductChange: asCallback(controls?.onProductChange),
    onProfileChange: asCallback(controls?.onProfileChange),
    onRemoveProduct: asCallback(controls?.onRemoveProduct),
    onRemoveProfile: asCallback(controls?.onRemoveProfile),
    onRemoveColor: asCallback(controls?.onRemoveColor),
  };
}

export function buildShowroomMaterials({
  colors = [],
  allowedColorIds,
  selectedColorId,
  onSelect,
} = {}) {
  const allowedIds = Array.isArray(allowedColorIds) && allowedColorIds.length > 0
    ? new Set(allowedColorIds)
    : null;
  const selectColor = asCallback(onSelect);

  return (Array.isArray(colors) ? colors : [])
    .filter((color) => !allowedIds || allowedIds.has(color?.id))
    .map((color) => ({
      id: asText(color?.id),
      label: asText(color?.name),
      color: asText(color?.hex),
      thumbnail: asText(color?.thumbnail),
      selected: color?.id === selectedColorId,
      onSelect: selectColor ? () => selectColor(color.id) : undefined,
    }));
}

export function buildShowroomViewModel({
  categories = [],
  selectedCategory,
  onCategoryChange,
  materials = [],
  estimate = {},
  customerActions = {},
  presentationEditable = false,
  presentationControls,
} = {}) {
  const editable = presentationEditable === true;
  const onShare = asCallback(customerActions?.onShare);
  return {
    categories: (Array.isArray(categories) ? categories : []).map(buildCategory),
    selectedCategory: asText(selectedCategory),
    onCategoryChange: asCallback(onCategoryChange),
    materials: (Array.isArray(materials) ? materials : []).map((material) => ({
      ...buildMaterial(material),
      onSelect: editable ? asCallback(material?.onSelect) : undefined,
    })),
    estimate: {
      label: asText(estimate?.label),
      displayTotal: asText(estimate?.displayTotal),
      qualifier: asText(estimate?.qualifier),
    },
    customerActions: {
      onShowBefore: asCallback(customerActions?.onShowBefore),
      onShowAfter: asCallback(customerActions?.onShowAfter),
      onToggleFullscreen: asCallback(customerActions?.onToggleFullscreen),
      onShare,
      onContact: asCallback(customerActions?.onContact),
      onApprove: asCallback(customerActions?.onApprove),
      onRequestQuote: asCallback(customerActions?.onRequestQuote),
      shareUnavailableReason: onShare ? undefined : asText(customerActions?.shareUnavailableReason),
    },
    ...(editable ? {
      presentationEditable: true,
      presentationControls: buildPresentationControls(presentationControls, selectedCategory),
    } : {}),
  };
}

export function PresentationCatalogEditor({ controls }) {
  const selectedProductId = controls.selectedProductId || '';
  const canRemoveProduct = typeof controls.onRemoveProduct === 'function' && Boolean(selectedProductId);
  const canChangeProduct = typeof controls.onProductChange === 'function';
  const canChangeProfile = typeof controls.onProfileChange === 'function';

  return (
    <section aria-label="Presentation catalog editor" className="showroom-presentation-editor control-block">
      <div className="showroom-section-heading">
        <span>Presentation editing</span>
        <h2>Products and profiles</h2>
      </div>
      {controls.unavailableReason && <p role="status">{controls.unavailableReason}</p>}
      <label>
        Product
        <select
          aria-label="Product"
          className="control-select"
          disabled={!canChangeProduct || !controls.productOptions.length}
          onChange={canChangeProduct ? (event) => controls.onProductChange(event.target.value) : undefined}
          value={selectedProductId}
        >
          {!selectedProductId && <option value="">Choose a product</option>}
          {controls.productOptions.map((option) => (
            <option key={`${option.source || 'catalog'}:${option.id}`} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="showroom-presentation-actions export-buttons">
        <button
          className="btn-secondary"
          disabled={!canRemoveProduct}
          onClick={canRemoveProduct ? () => controls.onRemoveProduct(selectedProductId) : undefined}
          type="button"
        >
          Remove Product
        </button>
      </div>
      {controls.profileOptions.length > 0 && (
        <label>
          Profile
          <select
            aria-label="Profile"
            className="control-select control-select-secondary"
            disabled={!canChangeProfile}
            onChange={canChangeProfile ? (event) => controls.onProfileChange(event.target.value) : undefined}
            value={controls.selectedProfile || ''}
          >
            {!controls.selectedProfile && <option value="">Choose a profile</option>}
            {controls.profileOptions.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
          </select>
        </label>
      )}
      <div className="showroom-presentation-actions export-buttons">
        <button
          className="btn-secondary"
          disabled={typeof controls.onRemoveProfile !== 'function' || !controls.selectedProfile}
          onClick={typeof controls.onRemoveProfile === 'function' && controls.selectedProfile
            ? controls.onRemoveProfile
            : undefined}
          type="button"
        >
          Remove Profile
        </button>
        <button
          className="btn-secondary"
          disabled={typeof controls.onRemoveColor !== 'function' || !controls.selectedColorId}
          onClick={typeof controls.onRemoveColor === 'function' && controls.selectedColorId
            ? controls.onRemoveColor
            : undefined}
          type="button"
        >
          Remove Color
        </button>
      </div>
    </section>
  );
}

function CustomerAction({ className, label, onClick }) {
  if (typeof onClick !== 'function') return null;
  return (
    <button className={className} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export function ShowroomQuoteCard({ materials, estimate, customerActions, presentationControls }) {
  const primaryAction = [
    ['approve', 'Approve This Design', customerActions.onApprove],
    ['quote', 'Request a Quote', customerActions.onRequestQuote],
    ['contact', 'Contact us', customerActions.onContact],
    ['share', 'Share Design', customerActions.onShare],
  ].find(([, , callback]) => typeof callback === 'function');

  return (
    <aside aria-label="Design selections and estimate" className="showroom-quote-region workspace-control-surface">
      <section aria-labelledby="showroom-material-heading" className="showroom-materials">
        <div className="showroom-section-heading">
          <span>Selected category</span>
          <h2 id="showroom-material-heading">Choose a finish</h2>
        </div>
        <div className="showroom-material-grid">
          {materials.map((material) => {
            const canSelect = typeof material.onSelect === 'function';

            return (
              <button
                aria-label={`Choose ${material.label}`}
                aria-pressed={material.selected === true}
                className={`showroom-material-swatch${material.selected === true ? ' is-selected' : ''}`}
                disabled={!canSelect}
                key={material.id}
                onClick={canSelect ? material.onSelect : undefined}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="showroom-material-color"
                  style={{ backgroundColor: material.color || 'transparent' }}
                >
                  {material.thumbnail && <img alt="" src={material.thumbnail} />}
                </span>
                <span className="showroom-material-copy">
                  <strong>{material.label}</strong>
                  {material.description && <small>{material.description}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Project estimate" className="showroom-estimate-card workspace-primary-actions">
        {presentationControls && <PresentationCatalogEditor controls={presentationControls} />}
        <div className="showroom-estimate-copy">
          <span>{estimate.label || 'Project estimate'}</span>
          {estimate.displayTotal && <strong>{estimate.displayTotal}</strong>}
          {estimate.qualifier && <p>{estimate.qualifier}</p>}
        </div>
        <div aria-label="Customer actions" className="showroom-customer-actions">
          {primaryAction?.[0] !== 'share' && (
            customerActions.onShare
              ? <CustomerAction label="Share" onClick={customerActions.onShare} />
              : customerActions.shareUnavailableReason
                ? (
                  <button disabled title={customerActions.shareUnavailableReason} type="button">
                    Share Design
                  </button>
                )
                : null
          )}
          {primaryAction?.[0] !== 'contact' && <CustomerAction label="Contact us" onClick={customerActions.onContact} />}
          {primaryAction && (
            <CustomerAction
              className="showroom-primary-action"
              label={primaryAction[1]}
              onClick={primaryAction[2]}
            />
          )}
          {customerActions.shareUnavailableReason && (
            <p className="showroom-action-unavailable" role="status">
              {customerActions.shareUnavailableReason}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}

export default function ShowroomModeShell({
  embedded = false,
  sessionType,
  viewerStage,
  categories = [],
  selectedCategory,
  onCategoryChange,
  materials = [],
  estimate = {},
  customerActions = {},
  presentationEditable = false,
  presentationControls,
  onExitPresentation,
  status = 'ready',
  errorMessage,
}) {
  if (!SESSION_TYPES.has(sessionType)) {
    throw new Error('Invalid Showroom session type');
  }
  const canExitPresentation = typeof onExitPresentation === 'function';
  const canEditPresentation = sessionType === 'authenticated-presentation'
    && presentationEditable === true;
  const viewModel = buildShowroomViewModel({
    categories,
    selectedCategory,
    onCategoryChange,
    materials,
    estimate,
    customerActions,
    presentationEditable: canEditPresentation,
    presentationControls,
  });

  if (status !== 'ready') {
    const isError = status === 'error' || status === 'invalid';
    return (
      <div
        className={`${embedded ? 'workspace-shell' : 'workspace-root'} showroom-workspace showroom-safe-state-workspace`}
        data-showroom-session={sessionType}
        data-workspace-mode="showroom"
      >
        <section
          aria-live={isError ? undefined : 'polite'}
          className="showroom-safe-state workspace-control-surface"
          role={isError ? 'alert' : 'status'}
        >
          <span>IronWrap Showroom</span>
          <h1>{isError ? 'Design unavailable' : 'Opening shared design'}</h1>
          <p>{isError ? (errorMessage || 'This shared design link is invalid or unavailable.') : 'Loading the design and its finishes…'}</p>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`${embedded ? 'workspace-shell' : 'workspace-root'} showroom-workspace`}
      data-showroom-session={sessionType}
      data-workspace-mode="showroom"
    >
      <div className="showroom-header">
        <MobileWorkspaceHeader
          eyebrow="IronWrap"
          mode="showroom"
          showMenu={false}
          step={{ label: 'Explore your design' }}
        />
        {sessionType === 'authenticated-presentation' && (
          <button
            className="showroom-exit-presentation"
            disabled={!canExitPresentation}
            onClick={canExitPresentation ? onExitPresentation : undefined}
            type="button"
          >
            Exit Presentation
          </button>
        )}
      </div>

      <aside className="showroom-category-region">
        <ShowroomCategoryRail
          {...(viewModel.presentationEditable ? { allowUnavailableSelection: true } : {})}
          categories={viewModel.categories}
          onCategoryChange={viewModel.onCategoryChange}
          selectedCategory={viewModel.selectedCategory}
        />
      </aside>

      <div className="showroom-viewer-region">
        {viewerStage}
        <div aria-label="Design comparison controls" className="showroom-viewer-actions">
          <CustomerAction label="Before" onClick={viewModel.customerActions.onShowBefore} />
          <CustomerAction label="After" onClick={viewModel.customerActions.onShowAfter} />
          <CustomerAction label="Full screen" onClick={viewModel.customerActions.onToggleFullscreen} />
        </div>
      </div>

      <ShowroomQuoteCard
        customerActions={viewModel.customerActions}
        estimate={viewModel.estimate}
        materials={viewModel.materials}
        {...(viewModel.presentationEditable ? { presentationControls: viewModel.presentationControls } : {})}
      />
    </div>
  );
}
