import { useId } from 'react';
import StudioButton from './ui/StudioButton.jsx';

export default function ContextInspector({
  title,
  mobileOpen,
  onMobileOpenChange,
  error,
  onRetry,
  busy = false,
  children,
}) {
  const contentId = useId();

  return (
    <aside
      aria-busy={busy}
      className={`context-inspector${mobileOpen ? ' is-mobile-open' : ''}`}
    >
      <div className="context-inspector-heading">
        <h2>{title}</h2>
        <StudioButton
          aria-controls={contentId}
          aria-expanded={mobileOpen}
          aria-label={`${mobileOpen ? 'Close' : 'Open'} ${title}`}
          onClick={() => onMobileOpenChange(!mobileOpen)}
        >
          {mobileOpen ? 'Close' : 'Open'} details
        </StudioButton>
      </div>
      <div id={contentId} className="context-inspector-content" hidden={!mobileOpen}>
        {error && (
          <div className="context-inspector-error" role="alert">
            <p>{error}</p>
            {onRetry && (
              <StudioButton disabled={busy} onClick={onRetry} variant="secondary">
                Try again
              </StudioButton>
            )}
          </div>
        )}
        {children}
      </div>
    </aside>
  );
}
