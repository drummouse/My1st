import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { formatBytes as money } from '../lib/fileUtils.js';

export default function AttachmentsPanel({ projectId, isCustomerView, onChanged }) {
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!projectId) return;
    fetch(`/api/attachments?projectId=${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => { setAttachments(rows); onChanged?.(rows); })
      .catch((err) => console.error('Attachments API error:', err));
  };

  useEffect(() => { load(); }, [projectId]);

  if (!projectId) return null;

  const handleUpload = async (kind, file) => {
    if (!file) return;
    setBusy(true);
    setStatus(`Uploading ${kind === 'photo' ? 'photo' : 'file'}…`);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ kind }),
      });
      const res = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, kind, fileName: file.name, url: blob.url, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus('Uploaded.');
      load();
    } catch (err) {
      console.error('Attachments API error:', err);
      setStatus(err.message || 'Could not upload — check the file size/type and try again.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 5000);
  };

  const handleRemove = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      load();
    } catch (err) {
      console.error('Attachments API error:', err);
      setStatus('Could not remove — the database may not be reachable yet.');
    }
    setBusy(false);
  };

  const files = attachments.filter((a) => a.kind === 'file');
  const photos = attachments.filter((a) => a.kind === 'photo');

  return (
    <div className="control-block">
      <div className="control-label">Attachments</div>

      <div className="field-label">Files</div>
      {files.map((f) => (
        <div className="service-row" key={f.id}>
          <a className="service-row-main" href={f.url} target="_blank" rel="noreferrer"><span>{f.file_name}</span></a>
          <span className="service-note">{money(f.size_bytes)}</span>
          {!isCustomerView && (
            <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemove(f.id)} aria-label={`Remove ${f.file_name}`}>×</button>
          )}
        </div>
      ))}
      {!isCustomerView && (
        <label className="btn-secondary studio-file-control" style={{ marginTop: '0.4rem', cursor: 'pointer' }}>
          + Attach File
          <input type="file" className="visually-hidden" disabled={busy} onChange={(e) => handleUpload('file', e.target.files?.[0])} />
        </label>
      )}

      <div className="field-label" style={{ marginTop: '0.75rem' }}>Photos</div>
      {photos.length > 0 && (
        <div className="color-card-grid">
          {photos.map((p) => (
            <div className="color-card" key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer">
                <span className="color-card-swatch" style={{ backgroundImage: `url(${p.url})`, backgroundSize: 'cover' }} />
              </a>
              <span className="color-card-meta">
                <span className="color-card-name">{p.file_name}</span>
                <span className="color-card-code">{money(p.size_bytes)}</span>
              </span>
              {!isCustomerView && (
                <button type="button" className="layer-remove-btn" disabled={busy} onClick={() => handleRemove(p.id)} aria-label={`Remove ${p.file_name}`}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {!isCustomerView && (
        <label className="btn-secondary studio-file-control" style={{ marginTop: '0.4rem', cursor: 'pointer' }}>
          + Attach Photo
          <input type="file" accept="image/*" className="visually-hidden" disabled={busy} onChange={(e) => handleUpload('photo', e.target.files?.[0])} />
        </label>
      )}

      <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
        Files (any format) show as a link in every report; Photos show a thumbnail plus a link to
        the full-resolution original. 15 MB per photo, 25 MB per file, 200 MB per project.
      </div>

      {status && <div className="control-sublabel">{status}</div>}
    </div>
  );
}
