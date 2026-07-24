export default function MobileWorkspaceHeader({
  mode,
  step = {},
  eyebrow,
  showMenu = true,
  menuTarget,
  onMenu,
  onExitPresentation,
  exitClassName,
}) {
  const stepLabel = step && step.label ? step.label : 'Workspace';
  const stepDescription = step && step.description ? step.description : '';

  return (
    <header className="workspace-mobile-header" data-workspace-mode={mode}>
      {showMenu && (
        <button
          aria-controls={menuTarget}
          aria-label="Open workspace menu"
          disabled={!onMenu && !menuTarget}
          onClick={onMenu}
          popovertarget={menuTarget}
          type="button"
        >Menu</button>
      )}
      <div className="workspace-mobile-step">
        <p>{eyebrow || (step.number ? `Step ${step.number}` : 'Workspace')}</p>
        <strong>{stepLabel}</strong>
        {stepDescription && <span>{stepDescription}</span>}
      </div>
      {onExitPresentation && (
        <button
          aria-label="Exit Presentation"
          className={exitClassName}
          onClick={onExitPresentation}
          type="button"
        >Exit Presentation</button>
      )}
    </header>
  );
}
