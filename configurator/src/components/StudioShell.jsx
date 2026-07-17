export default function StudioShell({
  mode,
  topBar,
  stepRail,
  viewer,
  inspector,
  estimateDock,
  platformContent,
  auxiliaryContent,
  notice,
}) {
  return (
    <div className="studio-shell" data-studio-mode={mode} data-studio-skin="ironwrap">
      <div className="studio-shell-top-bar">{topBar}</div>
      {notice && (
        <div className="studio-shell-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      {mode === 'platform' ? (
        <div className="studio-shell-platform">{platformContent}</div>
      ) : (
        <div className="studio-shell-layout">
          <div className="studio-shell-steps">{stepRail}</div>
          <main className="studio-shell-viewer">
            {viewer}
            {auxiliaryContent && <div className="studio-shell-auxiliary">{auxiliaryContent}</div>}
          </main>
          <div className="studio-shell-inspector">{inspector}</div>
          <div className="studio-shell-estimate">{estimateDock}</div>
        </div>
      )}
    </div>
  );
}
