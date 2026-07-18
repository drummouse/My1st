import { useEffect, useId, useRef, useState } from 'react';
import StudioButton from './ui/StudioButton.jsx';

export default function StudioTopBar({
  title,
  subtitle,
  logoUrl,
  projectLabel,
  projectStatus,
  projectActions,
  canShowExpert,
  expertActive,
  onToggleExpert,
  onLogout,
  onOpenNavigation,
}) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef(null);
  const projectMenuButtonRef = useRef(null);
  const projectMenuId = useId();
  const projectMenuButtonId = useId();
  const {
    onNew,
    onOpen,
    onSave,
    onShare,
    canOpen,
    canSave,
    canShare,
    busy: projectActionBusy = false,
    status: projectActionStatus = '',
  } = projectActions;

  useEffect(() => {
    if (!projectMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!projectMenuRef.current?.contains(event.target)) setProjectMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setProjectMenuOpen(false);
        projectMenuButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectMenuOpen]);

  const runProjectAction = (action) => {
    setProjectMenuOpen(false);
    return action();
  };

  return (
    <header className="studio-top-bar">
      <StudioButton aria-label="Open navigation" onClick={onOpenNavigation}>
        Menu
      </StudioButton>

      <div className="studio-top-bar-brand">
        {logoUrl && <img src={logoUrl} alt="" className="studio-top-bar-logo" />}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className="studio-top-bar-actions">
        <div className="studio-top-bar-project-menu" ref={projectMenuRef}>
          <button
            aria-controls={projectMenuId}
            aria-expanded={projectMenuOpen}
            aria-label={`Project: ${projectLabel}. ${projectStatus}. Project actions`}
            className="studio-button studio-button-secondary studio-top-bar-project"
            id={projectMenuButtonId}
            onClick={() => setProjectMenuOpen((open) => !open)}
            ref={projectMenuButtonRef}
            type="button"
          >
            <span>Project: {projectLabel}</span>
            <span className="studio-top-bar-project-status">{projectStatus}</span>
          </button>
          {projectMenuOpen && (
            <div
              aria-labelledby={projectMenuButtonId}
              className="studio-top-bar-project-menu-popover"
              id={projectMenuId}
            >
              <button type="button" onClick={() => runProjectAction(onNew)} disabled={projectActionBusy}>New Project</button>
              <button type="button" onClick={() => runProjectAction(onOpen)} disabled={projectActionBusy || !canOpen}>Open Project</button>
              <button className="studio-project-menu-primary" type="button" onClick={() => runProjectAction(onSave)} disabled={projectActionBusy || !canSave}>Save / Download</button>
              <button type="button" onClick={() => runProjectAction(onShare)} disabled={projectActionBusy || !canShare}>Share Design</button>
            </div>
          )}
        </div>
        {projectActionStatus && <p className="studio-top-bar-project-menu-status" role="status" aria-live="polite">{projectActionStatus}</p>}
        {canShowExpert && (
          <StudioButton
            aria-pressed={expertActive}
            onClick={onToggleExpert}
            variant={expertActive ? 'primary' : 'secondary'}
          >
            Expert mode
          </StudioButton>
        )}
        <StudioButton aria-label="Log out" onClick={onLogout}>
          Log out
        </StudioButton>
      </div>
    </header>
  );
}
