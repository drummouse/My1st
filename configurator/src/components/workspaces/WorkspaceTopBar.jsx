import { useEffect, useRef } from 'react';
import { focusProjectMenuBoundary, moveProjectMenuFocus } from '../../lib/projectMenuNavigation.js';

function WorkspaceMenu({ config, disabled = false, label }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const open = config.menuOpen === true;
  const onMenuClose = config.onMenuClose;
  const triggerId = `${config.menuId}-trigger`;

  useEffect(() => {
    if (!open) return undefined;

    if (pendingFocusRef.current) {
      focusProjectMenuBoundary(rootRef.current, pendingFocusRef.current);
      pendingFocusRef.current = null;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) onMenuClose?.(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onMenuClose?.(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onMenuClose, open]);

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const edge = event.key === 'ArrowUp' ? 'last' : 'first';
    if (open) {
      focusProjectMenuBoundary(rootRef.current, edge);
      return;
    }
    pendingFocusRef.current = edge;
    config.onMenuToggle?.(true);
  };

  const handleMenuKeyDown = (event) => {
    if (moveProjectMenuFocus(event.currentTarget, event.key, document.activeElement)) {
      event.preventDefault();
    }
  };

  const handleMenuClick = (event) => {
    if (!event.target.closest?.('[role="menuitem"]')) return;
    onMenuClose?.(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="workspace-topbar-menu" ref={rootRef}>
      <button
        aria-controls={config.menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        disabled={disabled || config.disabled === true}
        id={triggerId}
        onClick={() => config.onMenuToggle?.(!open)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        {config.label}
      </button>
      {open && (
        <div
          aria-label={label}
          aria-labelledby={triggerId}
          className="workspace-topbar-menu-popover"
          id={config.menuId}
          onClick={handleMenuClick}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          {config.menu}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceTopBar({
  mode,
  logoUrl,
  project = {},
  actions = {},
  navigation,
  account = {},
  onPresent,
  onExitPresentation,
}) {
  const publicShowroom = mode === 'showroom' && !onExitPresentation;
  const projectBusy = actions.busy === true;

  return (
    <header className="workspace-topbar" data-workspace-mode={mode}>
      {publicShowroom ? (
        <div className="workspace-topbar-brand">
          {logoUrl && <img alt="" className="workspace-topbar-logo" src={logoUrl} />}
          <span>Showroom</span>
        </div>
      ) : (
        <>
          <div className="workspace-topbar-brand">
            {logoUrl && <img alt="" className="workspace-topbar-logo" src={logoUrl} />}
            <span>{project.workspaceLabel || 'Workspace'}</span>
          </div>

          {mode !== 'showroom' && navigation && (
            <nav aria-label="Workspace navigation" className="workspace-topbar-navigation">
              {navigation}
            </nav>
          )}

          <div className="workspace-topbar-actions">
            {mode !== 'showroom' && project.label && (
              <WorkspaceMenu config={project} disabled={projectBusy} label="Project actions" />
            )}

            {mode !== 'showroom' && actions.onNew && (
              <button disabled={projectBusy} onClick={actions.onNew} type="button">New Project</button>
            )}
            {mode !== 'showroom' && onPresent && (
              <button disabled={projectBusy} onClick={onPresent} type="button">Present to Customer</button>
            )}
            {onExitPresentation && (
              <button className="workspace-topbar-exit" onClick={onExitPresentation} type="button">Exit Presentation</button>
            )}

            {mode !== 'showroom' && account.label && (
              <WorkspaceMenu config={account} label="User menu" />
            )}
          </div>
        </>
      )}
    </header>
  );
}
