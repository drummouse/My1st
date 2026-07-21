import ExpertToolRail, { DEFAULT_EXPERT_TOOLS } from './ExpertToolRail.jsx';
import MobileWorkspaceHeader from './MobileWorkspaceHeader.jsx';

export function ExpertSurfaceInspector({
  surface,
  material,
  color,
  hasOverride = false,
  onEditMaterial,
  onEditColor,
  onClearOverride,
  editor,
}) {
  if (!surface) {
    return (
      <p className="expert-empty-surface">
        Choose Select Surface, then select a roof or wall facet in the viewer.
      </p>
    );
  }

  return (
    <div className="expert-surface-details" data-surface-id={surface.id}>
      <div className="expert-surface-identity">
        <strong>{surface.identity}</strong>
        <span>{surface.measurement}</span>
        {surface.pitch && <span>{surface.pitch}</span>}
      </div>
      <div className="expert-surface-property">
        <span>Material</span>
        <strong>{material?.label || 'Project default'}</strong>
        {typeof onEditMaterial === 'function' && <button type="button" onClick={onEditMaterial}>Edit material</button>}
      </div>
      <div className="expert-surface-property">
        <span>Color</span>
        <strong>{color?.label || 'Project default'}</strong>
        {typeof onEditColor === 'function' && <button type="button" onClick={onEditColor}>Edit color</button>}
      </div>
      {hasOverride && typeof onClearOverride === 'function' && (
        <button type="button" className="btn-secondary" onClick={onClearOverride}>Clear surface override</button>
      )}
      {editor}
    </div>
  );
}

export default function ExpertWorkspaceShell({
  embedded = false,
  expertEntitled = false,
  showExpertMode = false,
  topBar,
  tools = DEFAULT_EXPERT_TOOLS,
  activeTool,
  onToolChange,
  viewerStage,
  surfaceInspector,
  estimate,
  onUpdateEstimate,
  onReturnToSales,
  onPresent,
  onOpenNavigation,
}) {
  if (expertEntitled !== true || showExpertMode !== true) return null;
  const activeToolDefinition = tools.find((tool) => tool.implemented === true && tool.key === activeTool);

  return (
    <div
      className={`${embedded ? 'workspace-shell' : 'workspace-root'} expert-workspace`}
      data-workspace-mode="expert"
      data-active-tool={activeTool || ''}
    >
      <div className="expert-workspace-mobile-header">
        <MobileWorkspaceHeader
          menuTarget="expert-navigation-drawer"
          mode="expert"
          onMenu={onOpenNavigation}
          step={{
            description: 'Selected-surface controls',
            label: activeToolDefinition?.label || 'Expert tools',
          }}
        />
      </div>
      <div className="expert-workspace-top" id="expert-navigation-drawer" popover="auto">
        <div className="expert-workspace-topbar">{topBar}</div>
        <div className="expert-workspace-mode-actions" aria-label="Expert workspace actions">
          <button type="button" disabled={!onReturnToSales} onClick={onReturnToSales}>Return to Sales</button>
          <button type="button" className="expert-present-action" disabled={!onPresent} onClick={onPresent}>Present to Customer</button>
        </div>
      </div>

      <aside className="expert-workspace-tools">
        <ExpertToolRail
          tools={tools}
          activeTool={activeTool}
          onToolChange={onToolChange}
          orientation="vertical"
        />
      </aside>

      <aside className="expert-workspace-compact-tools">
        <ExpertToolRail
          tools={tools}
          activeTool={activeTool}
          idPrefix="compact-"
          onToolChange={onToolChange}
          orientation="horizontal"
        />
      </aside>

      <div className="expert-workspace-viewer" role="region" aria-label="Expert model workspace">
        <div className="expert-active-tool" role="status">
          Active tool: {activeToolDefinition?.label || 'None'}
        </div>
        {viewerStage}
      </div>

      <aside className="expert-workspace-inspector workspace-control-surface" aria-label="Selected surface inspector">
        <section className="expert-surface-panel">
          <header className="expert-inspector-heading">
            <span>Selected surface</span>
            <strong>Inspector</strong>
          </header>
          {surfaceInspector || (
            <p className="expert-empty-surface">
              Select a roof or wall surface in the viewer to inspect measurements and overrides.
            </p>
          )}
        </section>

        <section className="expert-quick-estimate workspace-primary-actions" aria-label="Quick estimate">
          <div>
            <span>Quick estimate</span>
            <div className="expert-estimate-value">{estimate}</div>
          </div>
          <button
            type="button"
            className="expert-update-estimate"
            disabled={!onUpdateEstimate}
            onClick={onUpdateEstimate}
          >
            Update Estimate
          </button>
        </section>
      </aside>
    </div>
  );
}
