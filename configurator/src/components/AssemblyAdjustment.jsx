const AXES = [
  { key: 'dz', label: 'Vertical (roof height)', min: -60, max: 60 },
  { key: 'dx', label: 'Horizontal — East/West', min: -60, max: 60 },
  { key: 'dy', label: 'Horizontal — North/South', min: -60, max: 60 },
];

export default function AssemblyAdjustment({ offset, onChange, onReset }) {
  const setAxis = (key) => (val) => onChange({ ...offset, [key]: val });

  return (
    <div className="control-block">
      <div className="control-label">Roof/Wall Assembly Adjustment</div>
      <div className="control-sublabel">
        The roof and wall RoofRuler exports use independent coordinate frames, so they're
        auto-stacked by height for preview. Nudge the roof into place if it doesn't line up
        with these walls.
      </div>
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
      <button type="button" className="btn-secondary" onClick={onReset}>Reset to auto-stack</button>
    </div>
  );
}
