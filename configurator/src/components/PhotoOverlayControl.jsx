export default function PhotoOverlayControl({ photoOverlay, onChange }) {
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange({ url, opacity: photoOverlay?.opacity ?? 0.3 });
  };

  const clear = () => {
    if (photoOverlay?.url) URL.revokeObjectURL(photoOverlay.url);
    onChange(null);
  };

  return (
    <div className="control-block">
      <div className="control-label">Photo Overlay</div>
      <input type="file" accept="image/*" onChange={handleFile} />
      {photoOverlay?.url && (
        <>
          <label className="control-sublabel" htmlFor="overlay-opacity">
            Opacity: {Math.round(photoOverlay.opacity * 100)}%
          </label>
          <input
            id="overlay-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={photoOverlay.opacity}
            onChange={(e) => onChange({ ...photoOverlay, opacity: Number(e.target.value) })}
          />
          <button type="button" className="btn-secondary" onClick={clear}>Remove photo</button>
        </>
      )}
    </div>
  );
}
