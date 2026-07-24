import { useEffect, useState } from 'react';

const blankColorForm = () => ({ name: '', code: '', hex: '#888888', series: 'Custom', folderId: '' });
const blankMaterialForm = () => ({ name: '', kind: 'roof', pricePerSqft: '0', folderId: '' });

// Flat name list is enough for now — folders nest via parent_id, but this
// picker doesn't indent/tree them; a folder's full path isn't needed to
// pick "which one folder does this new item start in."
function FolderSelect({ id, folders, value, onChange, allowNone = true }) {
  return (
    <select id={id} className="control-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">— No folder —</option>}
      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

// A vertical "what's already there" sidebar, docked at the outer edge of its
// column — replaces a flat horizontal filter row with something that reads
// as a library tree at a glance. Folders can nest arbitrarily deep in the
// data model (parent_id) and the folders API already accepts it, but
// nothing in this panel's own "+ Add folder" form offers a parent picker —
// so every folder created here is a root folder, and this list stays flat
// rather than guessing at indentation for a level nothing here can create.
function FolderTree({ folders, activeId, onSelect, onRemove, allLabel, allCount, countFor, busy, align }) {
  return (
    <nav className={`folder-tree${align === 'right' ? ' folder-tree-right' : ''}`}>
      <button type="button" className={`folder-tree-item${!activeId ? ' active' : ''}`} onClick={() => onSelect('')}>
        <span>{allLabel}</span>
        <span className="folder-tree-count">{allCount}</span>
      </button>
      {folders.map((f) => (
        <div className="folder-tree-row" key={f.id}>
          <button type="button" className={`folder-tree-item${activeId === f.id ? ' active' : ''}`} onClick={() => onSelect(f.id)}>
            <span>{f.name}</span>
            <span className="folder-tree-count">{countFor(f.id)}</span>
          </button>
          <button type="button" className="layer-remove-btn folder-tree-remove" disabled={busy} onClick={() => onRemove(f.id)} aria-label={`Remove folder ${f.name}`}>×</button>
        </div>
      ))}
    </nav>
  );
}

export default function MaterialsPanel({ onColorsChanged, onMaterialsChanged }) {
  const [colors, setColors] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [colorFolders, setColorFolders] = useState([]);
  const [materialFolders, setMaterialFolders] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [colorForm, setColorForm] = useState(blankColorForm());
  const [materialForm, setMaterialForm] = useState(blankMaterialForm());
  const [newColorFolderName, setNewColorFolderName] = useState('');
  const [newMaterialFolderName, setNewMaterialFolderName] = useState('');
  const [colorFolderFilter, setColorFolderFilter] = useState('');
  const [materialFolderFilter, setMaterialFolderFilter] = useState('');
  const [addToFolderByColor, setAddToFolderByColor] = useState({}); // colorId -> folderId picked in its "add to folder" row
  const [editingColorsForMaterial, setEditingColorsForMaterial] = useState(null); // material id, or null
  const [draftMaterialColorIds, setDraftMaterialColorIds] = useState([]);

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

  const loadColorFolders = () =>
    fetch('/api/colors?folders=1')
      .then((res) => (res.ok ? res.json() : []))
      .then(setColorFolders)
      .catch((err) => console.error('Color folders API error:', err));

  const loadMaterialFolders = () =>
    fetch('/api/materials?folders=1')
      .then((res) => (res.ok ? res.json() : []))
      .then(setMaterialFolders)
      .catch((err) => console.error('Material folders API error:', err));

  useEffect(() => { loadColors(); loadMaterials(); loadColorFolders(); loadMaterialFolders(); }, []);

  if (!colors || !materials) {
    return (
      <div className="settings-panel">
        <div className="control-label">Profiles &amp; Colors</div>
        <div className="control-sublabel">{status || 'Loading library…'}</div>
      </div>
    );
  }

  const flash = (msg) => { setStatus(msg); setTimeout(() => setStatus(''), 4000); };

  // --- Colors ---

  const handleAddColorFolder = async () => {
    if (!newColorFolderName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/colors?folders=1', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColorFolderName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewColorFolderName('');
      await loadColorFolders();
    } catch (err) {
      console.error('Color folders API error:', err);
      flash('Could not add folder.');
    }
    setBusy(false);
  };

  const handleRemoveColorFolder = async (id) => {
    setBusy(true);
    try {
      await fetch(`/api/colors/${id}?folders=1`, { method: 'DELETE' });
      if (colorFolderFilter === id) setColorFolderFilter('');
      await Promise.all([loadColorFolders(), loadColors()]);
    } catch (err) {
      console.error('Color folders API error:', err);
      flash('Could not remove folder.');
    }
    setBusy(false);
  };

  const handleAddColor = async () => {
    if (!colorForm.name.trim()) { flash('Color name is required.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/colors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...colorForm, folderIds: colorForm.folderId ? [colorForm.folderId] : [] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setColorForm(blankColorForm());
      flash('Color added.');
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      flash('Could not save color.');
    }
    setBusy(false);
  };

  const handleRemoveColor = async (id) => {
    setBusy(true);
    try {
      await fetch(`/api/colors/${id}`, { method: 'DELETE' });
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      flash('Could not remove color.');
    }
    setBusy(false);
  };

  const handleAddColorToFolder = async (color, folderId) => {
    if (!folderId || color.folderIds?.includes(folderId)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/colors/${color.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: color.name, code: color.code, hex: color.hex, series: color.series, thumbnailUrl: color.thumbnail_url, folderIds: [...(color.folderIds || []), folderId] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      flash('Could not add color to folder.');
    }
    setBusy(false);
  };

  const handleRemoveColorFromFolder = async (color, folderId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/colors/${color.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: color.name, code: color.code, hex: color.hex, series: color.series, thumbnailUrl: color.thumbnail_url, folderIds: (color.folderIds || []).filter((f) => f !== folderId) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadColors();
    } catch (err) {
      console.error('Colors API error:', err);
      flash('Could not remove color from folder.');
    }
    setBusy(false);
  };

  // --- Materials ---

  const handleAddMaterialFolder = async () => {
    if (!newMaterialFolderName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/materials?folders=1', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMaterialFolderName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewMaterialFolderName('');
      await loadMaterialFolders();
    } catch (err) {
      console.error('Material folders API error:', err);
      flash('Could not add folder.');
    }
    setBusy(false);
  };

  const handleRemoveMaterialFolder = async (id) => {
    setBusy(true);
    try {
      await fetch(`/api/materials/${id}?folders=1`, { method: 'DELETE' });
      if (materialFolderFilter === id) setMaterialFolderFilter('');
      await Promise.all([loadMaterialFolders(), loadMaterials()]);
    } catch (err) {
      console.error('Material folders API error:', err);
      flash('Could not remove folder.');
    }
    setBusy(false);
  };

  const handleAddMaterial = async () => {
    if (!materialForm.name.trim()) { flash('Profile name is required.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/materials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: materialForm.name, kind: materialForm.kind, pricePerSqft: Number(materialForm.pricePerSqft) || 0, folderId: materialForm.folderId || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMaterialForm(blankMaterialForm());
      flash('Profile added.');
      await loadMaterials();
    } catch (err) {
      console.error('Materials API error:', err);
      flash('Could not save material.');
    }
    setBusy(false);
  };

  const handleRemoveMaterial = async (id) => {
    setBusy(true);
    try {
      await fetch(`/api/materials/${id}`, { method: 'DELETE' });
      await loadMaterials();
    } catch (err) {
      console.error('Materials API error:', err);
      flash('Could not remove material.');
    }
    setBusy(false);
  };

  const openColorEditor = (material) => {
    setEditingColorsForMaterial(material.id);
    setDraftMaterialColorIds(material.colorIds || []);
  };

  const saveMaterialColors = async (materialId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${materialId}?colors=1`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorIds: draftMaterialColorIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingColorsForMaterial(null);
      flash('Applicable colors saved.');
      await loadMaterials();
    } catch (err) {
      console.error('Materials API error:', err);
      flash('Could not save applicable colors.');
    }
    setBusy(false);
  };

  const visibleColors = colorFolderFilter ? colors.filter((c) => c.folderIds?.includes(colorFolderFilter)) : colors;
  const visibleMaterials = materialFolderFilter ? materials.filter((m) => m.folder_id === materialFolderFilter) : materials;

  return (
    <div className="settings-panel materials-colors-panel">
      <div className="control-label">Profiles &amp; Colors</div>
      <div className="control-sublabel">
        Custom entries layered on top of IronWrap's standard roof/wall profiles and Wrinkle/
        Icecrystal/Printech Woodgrain colors. Profiles (left) and Colors (right) are two separate
        libraries — a profile declares which colors from the Color Library apply to it, not the
        other way around. Each library's folder tree sits at the outer edge of its side.
      </div>

      <div className="materials-colors-layout">
        <section className="materials-colors-section materials-section">
          <div className="materials-colors-section-header">Profiles</div>
          <div className="materials-colors-section-body">
            <div className="folder-tree-dock">
              <FolderTree
                folders={materialFolders}
                activeId={materialFolderFilter}
                onSelect={setMaterialFolderFilter}
                onRemove={handleRemoveMaterialFolder}
                allLabel="All Profiles" allCount={materials.length}
                countFor={(fid) => materials.filter((m) => m.folder_id === fid).length}
                busy={busy}
              />
              <div className="settings-row" style={{ marginTop: '0.5rem' }}>
                <input type="text" className="control-select" placeholder="New folder" value={newMaterialFolderName} onChange={(e) => setNewMaterialFolderName(e.target.value)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleAddMaterialFolder} disabled={busy} style={{ width: '100%' }}>+ Add folder</button>
            </div>

            <div className="materials-colors-main">
              <div className="field-label">Profiles{materialFolderFilter ? ` — ${materialFolders.find((f) => f.id === materialFolderFilter)?.name}` : ''}</div>
              {visibleMaterials.map((m) => (
                <div key={m.id}>
                  <div className="service-row">
                    <label className="service-row-main"><span>{m.name}</span></label>
                    <span className="service-note">{m.kind === 'wall' ? 'Wall' : 'Roof'}</span>
                    <span className="service-note">${Number(m.price_per_sqft).toFixed(2)}/sqft</span>
                    <span className="service-note">{materialFolders.find((f) => f.id === m.folder_id)?.name || 'Unfiled'}</span>
                    <button type="button" className="btn-secondary" onClick={() => (editingColorsForMaterial === m.id ? setEditingColorsForMaterial(null) : openColorEditor(m))}>
                      Applicable colors ({m.colorIds?.length || 0})
                    </button>
                    <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemoveMaterial(m.id)} aria-label={`Remove ${m.name}`}>×</button>
                  </div>
                  {editingColorsForMaterial === m.id && (
                    <div className="control-sublabel" style={{ marginLeft: '1rem', marginBottom: '0.5rem' }}>
                      <div style={{ marginBottom: '0.3rem' }}>
                        No colors checked means "not restricted" — the in-project picker shows every color. Check at least one to limit this material to just those colors.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {colors.map((c) => (
                          <label key={c.id} className="uniform-toggle">
                            <input
                              type="checkbox" checked={draftMaterialColorIds.includes(c.id)}
                              onChange={(e) => setDraftMaterialColorIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((i) => i !== c.id)))}
                            />
                            <span>{c.name}</span>
                          </label>
                        ))}
                      </div>
                      <button type="button" className="btn-primary" style={{ marginTop: '0.4rem' }} disabled={busy} onClick={() => saveMaterialColors(m.id)}>Save applicable colors</button>
                    </div>
                  )}
                </div>
              ))}

              <div className="control-block" style={{ marginTop: '0.75rem' }}>
                <div className="field-label">Add a profile</div>
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
                  <label htmlFor="material-folder">Folder</label>
                  <FolderSelect id="material-folder" folders={materialFolders} value={materialForm.folderId} onChange={(v) => setMaterialForm((f) => ({ ...f, folderId: v }))} />
                </div>
                <div className="export-buttons">
                  <button type="button" className="btn-primary" onClick={handleAddMaterial} disabled={busy} style={{ width: '100%' }}>Add Profile</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="materials-colors-section colors-section">
          <div className="materials-colors-section-header">Colors</div>
          <div className="materials-colors-section-body">
            <div className="materials-colors-main">
              <div className="field-label">Colors{colorFolderFilter ? ` — ${colorFolders.find((f) => f.id === colorFolderFilter)?.name}` : ''}</div>
              {visibleColors.map((c) => (
                <div className="service-row" key={c.id} style={{ flexWrap: 'wrap' }}>
                  <span className="color-picker-btn-swatch" style={{ background: c.hex }} />
                  <label className="service-row-main"><span>{c.name}</span></label>
                  {c.code && <span className="service-note">{c.code}</span>}
                  <span className="service-note">
                    {(c.folderIds || []).map((fid) => colorFolders.find((f) => f.id === fid)?.name).filter(Boolean).join(', ') || 'Unfiled'}
                  </span>
                  {colorFolderFilter && c.folderIds?.includes(colorFolderFilter) && (
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => handleRemoveColorFromFolder(c, colorFolderFilter)}>Remove from this folder</button>
                  )}
                  <select
                    className="control-select" value={addToFolderByColor[c.id] || ''}
                    onChange={(e) => setAddToFolderByColor((m) => ({ ...m, [c.id]: e.target.value }))}
                  >
                    <option value="">Add to folder…</option>
                    {colorFolders.filter((f) => !c.folderIds?.includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button
                    type="button" className="btn-secondary" disabled={busy || !addToFolderByColor[c.id]}
                    onClick={() => { handleAddColorToFolder(c, addToFolderByColor[c.id]); setAddToFolderByColor((m) => ({ ...m, [c.id]: '' })); }}
                  >
                    Add
                  </button>
                  <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemoveColor(c.id)} aria-label={`Remove ${c.name}`}>×</button>
                </div>
              ))}

              <div className="control-block" style={{ marginTop: '0.75rem' }}>
                <div className="field-label">Add a color</div>
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
                  <label htmlFor="color-series">Group (picker tab)</label>
                  <input id="color-series" type="text" className="control-select" value={colorForm.series} onChange={(e) => setColorForm((f) => ({ ...f, series: e.target.value }))} />
                </div>
                <div className="settings-row">
                  <label htmlFor="color-folder">Starting folder</label>
                  <FolderSelect id="color-folder" folders={colorFolders} value={colorForm.folderId} onChange={(v) => setColorForm((f) => ({ ...f, folderId: v }))} />
                </div>
                <div className="export-buttons">
                  <button type="button" className="btn-primary" onClick={handleAddColor} disabled={busy} style={{ width: '100%' }}>Add Color</button>
                </div>
              </div>
            </div>

            <div className="folder-tree-dock">
              <FolderTree
                folders={colorFolders}
                activeId={colorFolderFilter}
                onSelect={setColorFolderFilter}
                onRemove={handleRemoveColorFolder}
                allLabel="All Colors" allCount={colors.length}
                countFor={(fid) => colors.filter((c) => c.folderIds?.includes(fid)).length}
                busy={busy} align="right"
              />
              <div className="settings-row" style={{ marginTop: '0.5rem' }}>
                <input type="text" className="control-select" placeholder="New folder" value={newColorFolderName} onChange={(e) => setNewColorFolderName(e.target.value)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleAddColorFolder} disabled={busy} style={{ width: '100%' }}>+ Add folder</button>
            </div>
          </div>
        </section>
      </div>

      {status && <div className="control-sublabel">{status}</div>}
    </div>
  );
}
