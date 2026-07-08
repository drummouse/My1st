const AXES = [
  { key: 'dz', label: 'Vertical', min: -60, max: 60 },
  { key: 'dx', label: 'Horizontal — East/West', min: -60, max: 60 },
  { key: 'dy', label: 'Horizontal — North/South', min: -60, max: 60 },
];

const ZERO_OFFSET = { dx: 0, dy: 0, dz: 0 };

export default function AssemblyAdjustment({ layers, layerOffsets, activeLayerId, onActiveLayerChange, onChange, onReset }) {
  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0];
  if (!activeLayer) return null;
  const offset = layerOffsets?.[activeLayer.id] || ZERO_OFFSET;
  const setAxis = (key) => (val) => onChange(activeLayer.id, { ...offset, [key]: val });

  return (
    <div className="control-block">
      <div className="control-label">Layer Position Adjustment</div>
      <div className="control-sublabel">
        Each layer's RoofRuler export uses its own independent coordinate frame, so layers are
        auto-stacked by height for preview. Pick a layer and nudge it into place if it doesn't
        line up with the others.
      </div>

      {layers.length > 1 && (
        <>
          <label className="field-label" htmlFor="assembly-layer-select">Layer</label>
          <select
            id="assembly-layer-select"
            className="control-select"
            value={activeLayer.id}
            onChange={(e) => onActiveLayerChange(e.target.value)}
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </>
      )}

      {AXES.map(({ key, label, min, max }) => (
        <div key={key} className="adjust-row">
          <label htmlFor={`adjust-${key}`}>{label}</label>
          <input
            id={`adjust-${key}`}
            type="range"
            min={min}
            max={max}
            step="0.5"
            value={offset[key] || 0}
            onChange={(e) => setAxis(key)(Number(e.target.value))}
          />
          <input
            type="number"
            className="adjust-number"
            value={offset[key] || 0}
            step="0.5"
            onChange={(e) => setAxis(key)(Number(e.target.value) || 0)}
          />
          <span className="service-unit">ft</span>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => onReset(activeLayer.id)}>Reset to auto-stack</button>
    </div>
  );
}
