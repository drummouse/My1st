import ShowroomCategoryRail from './ShowroomCategoryRail.jsx';
import MobileWorkspaceHeader from './MobileWorkspaceHeader.jsx';

const SESSION_TYPES = new Set(['authenticated-presentation', 'public']);
const asCallback = (value) => (typeof value === 'function' ? value : undefined);
const asText = (value) => (
  typeof value === 'string' || typeof value === 'number' ? value : undefined
);

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
} = {}) {
  const onShare = asCallback(customerActions?.onShare);
  return {
    categories: (Array.isArray(categories) ? categories : []).map(buildCategory),
    selectedCategory: asText(selectedCategory),
    onCategoryChange: asCallback(onCategoryChange),
    materials: (Array.isArray(materials) ? materials : []).map(buildMaterial),
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
  };
}

function CustomerAction({ className, label, onClick }) {
  if (typeof onClick !== 'function') return null;
  return (
    <button className={className} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export function ShowroomQuoteCard({ materials, estimate, customerActions }) {
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
  onExitPresentation,
  status = 'ready',
  errorMessage,
}) {
  if (!SESSION_TYPES.has(sessionType)) {
    throw new Error('Invalid Showroom session type');
  }
  const canExitPresentation = typeof onExitPresentation === 'function';
  const viewModel = buildShowroomViewModel({
    categories,
    selectedCategory,
    onCategoryChange,
    materials,
    estimate,
    customerActions,
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
      />
    </div>
  );
}
