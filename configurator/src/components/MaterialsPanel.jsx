import { useEffect, useState } from 'react';

const blankColorForm = () => ({ name: '', code: '', hex: '#888888', series: 'Custom' });
const blankMaterialForm = () => ({ name: '', kind: 'roof', pricePerSqft: '0', profiles: '' });

export default function MaterialsPanel({ onColorsChanged, onMaterialsChanged }) {
  const [colors, setColors] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [colorForm, setColorForm] = useState(blankColorForm());
  const [materialForm, setMaterialForm] = useState(blankMaterialForm());

  const loadColors = () =>
    fetch('/api/colors')
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((rows) => { setColors(rows); onColorsChanged?.(rows); })
      .catch((err) => { console.error('Colors API error:', err); setColors([]); });

  const loadMaterials = () =>
    fetch('/api/materials')
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((rows) => { setMaterials(rows); onMaterialsChanged?.(rows); })
      .catch((err) => { console.error('Materials API error:', err); setMaterials([]); });

  useEffect(() => { loadColors(); loadMaterials(); }, []);

  if (!colors || !materials) {
    return (
      <div className="settings-panel">
        <div className="control-label">Materials &amp; Colors</div>
        <div className="control-sublabel">{status || 'Loading library…'}</div>
      </div>
    );
  }

  const handleAddColor = async () => {
    if (!colorForm.name.trim()) { setStatus('Color name is required.'); return; }
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colorForm),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setColorForm(blankColorForm());
      setStatus('Color added.');
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      setStatus('Could not save — the database may not be reachable yet.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 4000);
  };

  const handleRemoveColor = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/colors/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      setStatus('Could not remove — the database may not be reachable yet.');
    }
    setBusy(false);
  };

  const handleAddMaterial = async () => {
    if (!materialForm.name.trim()) { setStatus('Material name is required.'); return; }
    setBusy(true);
    setStatus('Saving…');
    try {
      const profiles = materialForm.profiles.split(',').map((p) => p.trim()).filter(Boolean);
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: materialForm.name, kind: materialForm.kind, pricePerSqft: Number(materialForm.pricePerSqft) || 0, profiles }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMaterialForm(blankMaterialForm());
      setStatus('Material added.');
      await loadMaterials();
    } catch (err) {
      console.error('Materials API error:', err);
      setStatus('Could not save — the database may not be reachable yet.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 4000);
  };

  const handleRemoveMaterial = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await loadMaterials();
    } catch (err) {
      console.error('Materials API error:', err);
      setStatus('Could not remove — the database may not be reachable yet.');
    }
    setBusy(false);
  };

  return (
    <div className="settings-panel">
      <div className="control-label">Materials &amp; Colors</div>
      <div className="control-sublabel">
        Custom entries layered on top of IronWrap's standard roof/wall products and Wrinkle/
        Icecrystal/Printech Woodgrain colors — available everywhere those are picked from,
        including on already-shared project links.
      </div>

      <div className="control-block">
        <div className="field-label">Colors</div>
        {colors.map((c) => (
          <div className="service-row" key={c.id}>
            <span className="color-picker-btn-swatch" style={{ background: c.hex }} />
            <label className="service-row-main"><span>{c.name}</span></label>
            {c.code && <span className="service-note">{c.code}</span>}
            <span className="service-note">{c.series}</span>
            <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemoveColor(c.id)} aria-label={`Remove ${c.name}`}>×</button>
          </div>
        ))}
        <div className="settings-row">
          <label htmlFor="color-name">Name</label>
          <input id="color-name" type="text" className="control-select" value={colorForm.name} onChange={(e) => setColorForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="color-code">Code (optional)</label>
          <input id="color-code" type="text" className="control-select" value={colorForm.code} onChange={(e) => setColorForm((f) => ({ ...f, code: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="color-hex">Swatch color</label>
          <input id="color-hex" type="color" className="control-select" value={colorForm.hex} onChange={(e) => setColorForm((f) => ({ ...f, hex: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="color-series">Group (shown as a tab/section)</label>
          <input id="color-series" type="text" className="control-select" value={colorForm.series} onChange={(e) => setColorForm((f) => ({ ...f, series: e.target.value }))} />
        </div>
        <div className="export-buttons">
          <button type="button" className="btn-primary" onClick={handleAddColor} disabled={busy} style={{ width: '100%' }}>Add Color</button>
        </div>
      </div>

      <div className="control-block">
        <div className="field-label">Materials</div>
        {materials.map((m) => (
          <div className="service-row" key={m.id}>
            <label className="service-row-main"><span>{m.name}</span></label>
            <span className="service-note">{m.kind === 'wall' ? 'Wall' : 'Roof'}</span>
            <span className="service-note">${Number(m.price_per_sqft).toFixed(2)}/sqft</span>
            <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemoveMaterial(m.id)} aria-label={`Remove ${m.name}`}>×</button>
          </div>
        ))}
        <div className="settings-row">
          <label htmlFor="material-name">Name</label>
          <input id="material-name" type="text" className="control-select" value={materialForm.name} onChange={(e) => setMaterialForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="material-kind">Applies to</label>
          <select id="material-kind" className="control-select" value={materialForm.kind} onChange={(e) => setMaterialForm((f) => ({ ...f, kind: e.target.value }))}>
            <option value="roof">Roof</option>
            <option value="wall">Wall</option>
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="material-price">Price per sqft ($)</label>
          <input id="material-price" type="number" min="0" step="0.01" className="control-select" value={materialForm.pricePerSqft} onChange={(e) => setMaterialForm((f) => ({ ...f, pricePerSqft: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="material-profiles">Profiles (comma-separated, optional)</label>
          <input id="material-profiles" type="text" className="control-select" value={materialForm.profiles} onChange={(e) => setMaterialForm((f) => ({ ...f, profiles: e.target.value }))} />
        </div>
        <div className="export-buttons">
          <button type="button" className="btn-primary" onClick={handleAddMaterial} disabled={busy} style={{ width: '100%' }}>Add Material</button>
        </div>
      </div>

      {status && <div className="control-sublabel">{status}</div>}
    </div>
  );
}
