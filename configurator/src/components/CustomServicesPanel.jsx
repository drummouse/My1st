import { useEffect, useState } from 'react';

const UNITS = ['each', 'sqft', 'LF'];

const blankForm = () => ({ name: '', unit: 'each', price: '0', description: '', linkUrl: '' });

export default function CustomServicesPanel({ onChanged }) {
  const [services, setServices] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blankForm());

  const load = () =>
    fetch('/api/custom-services')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        setServices(rows);
        onChanged?.(rows);
      })
      .catch((err) => {
        console.error('Custom services API error:', err);
        setStatus('Could not reach the database — custom services may not save.');
        setServices([]);
      });

  useEffect(() => { load(); }, []);

  if (!services) {
    return (
      <div className="settings-panel">
        <div className="control-label">Custom Services</div>
        <div className="control-sublabel">{status || 'Loading custom services…'}</div>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setStatus('Name is required.');
      return;
    }
    setBusy(true);
    setStatus('Saving…');
    try {
      const res = await fetch('/api/custom-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, unit: form.unit, price: Number(form.price) || 0, description: form.description, linkUrl: form.linkUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForm(blankForm());
      setStatus('Added.');
      await load();
    } catch (err) {
      console.error('Custom services API error:', err);
      setStatus('Could not save — the database may not be reachable yet.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 4000);
  };

  const handleRemove = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/custom-services/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      console.error('Custom services API error:', err);
      setStatus('Could not remove — the database may not be reachable yet.');
    }
    setBusy(false);
  };

  return (
    <div className="settings-panel custom-services-panel-layout">
      <div className="control-label">Custom Services</div>
      <div className="control-sublabel">
        Extra services beyond the fixed set (Roof, Wall, Soffit, ...) available to add to any
        project from the Optional Services list — a simple name, unit price, and description, not
        a formula.
      </div>

      <div className="materials-colors-section custom-services-existing">
        <div className="materials-colors-section-header custom-services-existing-header">
          Existing services ({services.length})
        </div>
        <div className="custom-services-existing-body">
          {services.length === 0 && <div className="control-sublabel">None defined yet — add one on the right.</div>}
          {services.map((s) => (
            <div className="service-row" key={s.id}>
              <label className="service-row-main"><span>{s.name}</span></label>
              <span className="service-note">${Number(s.price).toFixed(2)}/{s.unit}</span>
              {s.description && <span className="service-note">{s.description}</span>}
              {s.link_url && <a href={s.link_url} target="_blank" rel="noreferrer" className="service-note">Link</a>}
              <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemove(s.id)} aria-label={`Remove ${s.name}`}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="control-block custom-services-add sticky-form-pane">
        <div className="field-label">Add a service</div>
        <div className="settings-row">
          <label htmlFor="cs-name">Name</label>
          <input id="cs-name" type="text" className="control-select" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="cs-unit">Unit</label>
          <select id="cs-unit" className="control-select" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="cs-price">Price per unit ($)</label>
          <input id="cs-price" type="number" min="0" step="0.01" className="control-select" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="cs-description">Description</label>
          <input id="cs-description" type="text" className="control-select" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="settings-row">
          <label htmlFor="cs-link">Link (image/web reference, optional)</label>
          <input id="cs-link" type="text" className="control-select" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} />
        </div>
        <div className="export-buttons">
          <button type="button" className="btn-primary" onClick={handleAdd} disabled={busy} style={{ width: '100%' }}>
            Add Service
          </button>
        </div>
      </div>

      {status && <div className="control-sublabel">{status}</div>}
    </div>
  );
}
