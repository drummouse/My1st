import StudioButton from './ui/StudioButton.jsx';
import StudioPanel from './ui/StudioPanel.jsx';

export default function ViewerWorkspace({ viewerMode, onViewerModeChange, children }) {
  const isMinimized = viewerMode === 'minimized';
  const isMaximized = viewerMode === 'maximized';

  return (
    <StudioPanel
      as="section"
      className={`viewer-workspace viewer-${viewerMode}`}
      aria-label="3D model workspace"
    >
      <div className="viewer-toolbar">
        <span className="viewer-toolbar-title">3D Model</span>
        <div className="viewer-toolbar-actions">
          {isMinimized ? (
            <StudioButton aria-label="Show 3D Model" onClick={() => onViewerModeChange('normal')}>
              Show 3D Model
            </StudioButton>
          ) : (
            <StudioButton aria-label="Hide 3D Model" onClick={() => onViewerModeChange('minimized')}>
              Hide 3D Model
            </StudioButton>
          )}
          {isMaximized ? (
            <StudioButton aria-label="Restore 3D Model" onClick={() => onViewerModeChange('normal')}>
              Restore
            </StudioButton>
          ) : (
            <StudioButton
              aria-label="Full Screen"
              disabled={isMinimized}
              onClick={() => onViewerModeChange('maximized')}
            >
              Full Screen
            </StudioButton>
          )}
        </div>
      </div>

      {!isMinimized && <div className="viewer-workspace-content">{children}</div>}
    </StudioPanel>
  );
}
