import StudioButton from './ui/StudioButton.jsx';

export default function StudioTopBar({
  title,
  subtitle,
  logoUrl,
  saveState,
  canUseExpert,
  expertActive,
  onToggleExpert,
  onLogout,
  onOpenNavigation,
}) {
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
        {saveState && <p aria-live="polite">{saveState}</p>}
        {canUseExpert && (
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
