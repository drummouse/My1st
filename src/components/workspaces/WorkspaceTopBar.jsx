import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusProjectMenuBoundary, moveProjectMenuFocus } from '../../lib/projectMenuNavigation.js';

function WorkspaceMenu({ config, disabled = false, label }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const open = config.menuOpen === true;
  const onMenuClose = config.onMenuClose;
  const triggerId = `${config.menuId}-trigger`;

  const updatePopoverPosition = () => {
    if (typeof window === 'undefined') return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPopoverStyle({
      minWidth: `${Math.max(192, Math.round(bounds.width))}px`,
      right: `${Math.max(8, Math.round(window.innerWidth - bounds.right))}px`,
      top: `${Math.round(bounds.bottom + 6)}px`,
    });
  };

  useEffect(() => {
    if (!open) return undefined;

    if (pendingFocusRef.current) {
      focusProjectMenuBoundary(popoverRef.current || rootRef.current, pendingFocusRef.current);
      pendingFocusRef.current = null;
    }

    updatePopoverPosition();

    const handlePointerDown = (event) => {
      const containsTarget = (ref) => typeof ref.current?.contains === 'function'
        && ref.current.contains(event.target);
      if (!containsTarget(rootRef) && !containsTarget(popoverRef)) {
        onMenuClose?.(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onMenuClose?.(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    const windowTarget = typeof window === 'undefined' ? null : window;
    windowTarget?.addEventListener?.('resize', updatePopoverPosition);
    document.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      windowTarget?.removeEventListener?.('resize', updatePopoverPosition);
      document.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [onMenuClose, open]);

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const edge = event.key === 'ArrowUp' ? 'last' : 'first';
    if (open) {
      focusProjectMenuBoundary(popoverRef.current || rootRef.current, edge);
      return;
    }
    pendingFocusRef.current = edge;
    updatePopoverPosition();
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

  const menu = open && (
    <div
      aria-label={label}
      aria-labelledby={triggerId}
      className="workspace-topbar-menu-popover"
      data-workspace-menu-overlay="true"
      id={config.menuId}
      onClick={handleMenuClick}
      onKeyDown={handleMenuKeyDown}
      ref={popoverRef}
      role="menu"
      style={popoverStyle || undefined}
    >
      {config.menu}
    </div>
  );
  const portalTarget = typeof document === 'undefined' || typeof document.querySelector !== 'function'
    ? null
    : document.querySelector('[data-workspace-menu-root="true"]');

  return (
    <div className="workspace-topbar-menu" ref={rootRef}>
      <button
        aria-controls={config.menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        disabled={disabled || config.disabled === true}
        id={triggerId}
        onClick={() => {
          if (!open) updatePopoverPosition();
          config.onMenuToggle?.(!open);
        }}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        {config.label}
      </button>
      {menu && (portalTarget ? createPortal(menu, portalTarget) : menu)}
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
