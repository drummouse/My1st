export default function ViewerStage({
  viewer,
  toolbar,
  cameraControls,
  positioning,
  notice,
  mode,
}) {
  return (
    <main aria-label="3D model viewer" className="workspace-viewer-stage" data-workspace-mode={mode}>
      {toolbar && <div className="workspace-viewer-toolbar">{toolbar}</div>}
      <div className="workspace-viewer-content">{viewer}</div>
      {(cameraControls || positioning) && (
        <div className="workspace-viewer-controls" aria-label="Viewer controls">
          {cameraControls}
          {positioning}
        </div>
      )}
      {notice && <p aria-live="polite" className="workspace-viewer-notice" role="status">{notice}</p>}
    </main>
  );
}
