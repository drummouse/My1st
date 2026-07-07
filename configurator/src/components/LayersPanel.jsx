function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function makeLayerId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function LayersPanel({ house, onMetaChange, onAddLayer, onRemoveLayer, onToggleVisibility, onRenameLayer }) {
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const xml = await readFileAsText(file);
    const name = file.name.replace(/\.xml$/i, '');
    onAddLayer({ id: makeLayerId(), name: name || `Layer ${house.layers.length + 1}`, xml, visible: true });
    e.target.value = ''; // allow re-selecting the same filename later
  };

  return (
    <div className="control-block">
      <div className="control-label">House / Project</div>

      <label className="field-label" htmlFor="job-number">Job #</label>
      <input id="job-number" className="control-select" value={house.jobNumber} onChange={(e) => onMetaChange({ jobNumber: e.target.value })} />

      <label className="field-label" htmlFor="customer-name">Customer</label>
      <input id="customer-name" className="control-select" value={house.customerName} onChange={(e) => onMetaChange({ customerName: e.target.value })} />

      <label className="field-label" htmlFor="job-address">Address</label>
      <input id="job-address" className="control-select" value={house.address} onChange={(e) => onMetaChange({ address: e.target.value })} />

      <div className="control-label" style={{ marginTop: '0.75rem' }}>Layers</div>
      <div className="control-sublabel">
        Import one RoofRuler/AppliCAD XML report per structure — roof, wall, a garage roof, a
        second building, anything. Each import becomes its own layer: toggle it on/off, rename
        it, or remove it any time. Layers stack automatically for preview; nudge one into place
        below the 3D model if it doesn't line up.
      </div>

      <ul className="layer-list">
        {house.layers.map((layer) => (
          <li key={layer.id} className="layer-row">
            <label className="layer-visible-toggle">
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={(e) => onToggleVisibility(layer.id, e.target.checked)}
              />
            </label>
            <input
              className="control-select layer-name-input"
              value={layer.name}
              onChange={(e) => onRenameLayer(layer.id, e.target.value)}
            />
            <button
              type="button"
              className="layer-remove-btn"
              onClick={() => onRemoveLayer(layer.id)}
              disabled={house.layers.length <= 1}
              title={house.layers.length <= 1 ? 'At least one layer is required' : 'Remove layer'}
              aria-label={`Remove ${layer.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <label className="btn-secondary import-file-btn" htmlFor="import-layer-xml">Import Layer (XML)</label>
      <input id="import-layer-xml" type="file" accept=".xml" onChange={handleFile} className="visually-hidden" />
      <div className="control-sublabel">
        Soffit/fascia/gutter/downspout totals below aren't in these XML exports and stay editable
        as manual entries.
      </div>
    </div>
  );
}
