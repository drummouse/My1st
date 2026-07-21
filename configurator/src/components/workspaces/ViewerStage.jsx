import { createContext, useContext, useEffect, useState } from 'react';

const ModelPositioningContext = createContext(null);

export const useModelPositioning = () => useContext(ModelPositioningContext);

const startsOpen = () => !(typeof window !== 'undefined'
  && window.matchMedia?.('(max-width: 767px)').matches);

export default function ViewerStage({
  viewer,
  toolbar,
  cameraControls,
  positioning,
  notice,
  mode,
}) {
  const [positioningOpen, setPositioningOpen] = useState(startsOpen);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mobileBreakpoint = window.matchMedia?.('(max-width: 767px)');
    if (!mobileBreakpoint?.addEventListener) return undefined;
    const handleBreakpointChange = (event) => setPositioningOpen(!event.matches);
    mobileBreakpoint.addEventListener('change', handleBreakpointChange);
    return () => mobileBreakpoint.removeEventListener('change', handleBreakpointChange);
  }, []);
  const positioningState = {
    positioningOpen,
    onClose: () => setPositioningOpen(false),
    onOpen: () => setPositioningOpen(true),
  };

  return (
    <ModelPositioningContext.Provider value={positioningState}>
      <main
        aria-label="3D model viewer"
        className="workspace-viewer-stage"
        data-positioning-open={positioningOpen ? 'true' : 'false'}
        data-workspace-mode={mode}
      >
        {toolbar && <div className="workspace-viewer-toolbar">{toolbar}</div>}
        <div className="workspace-viewer-content">{viewer}</div>
        {cameraControls && (
          <div className="viewer-direction-controls" aria-label="Camera directions">
            {cameraControls}
          </div>
        )}
        {positioningOpen && positioning && (
          <div className="workspace-viewer-controls" aria-label="Model positioning controls">
            {positioning}
          </div>
        )}
        {!positioningOpen && positioning && (
          <button
            type="button"
            className="model-positioning-launcher"
            aria-label="Open model positioning"
            onClick={() => setPositioningOpen(true)}
          >
            Model Positioning
          </button>
        )}
        {notice && <p aria-live="polite" className="workspace-viewer-notice" role="status">{notice}</p>}
      </main>
    </ModelPositioningContext.Provider>
  );
}
