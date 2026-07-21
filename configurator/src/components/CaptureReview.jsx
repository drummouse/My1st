import { useEffect, useState } from 'react';
import { captureApi, captureAssetBlobUrl } from '../lib/captureClient.js';

const QUEUE_STATUSES = [
  ['', 'All'], ['submitted', 'Submitted'], ['in_review', 'In review'],
  ['changes_requested', 'Changes requested'], ['approved', 'Approved'], ['rejected', 'Rejected'],
];

const STATUS_LABELS = Object.fromEntries(QUEUE_STATUSES.filter(([id]) => id));
STATUS_LABELS.publishing = 'Publishing';
STATUS_LABELS.published = 'Published';

const FIELD_ROWS = [
  ['manufacturer', 'Manufacturer'], ['supplier', 'Supplier'], ['sku', 'SKU'],
  ['barcode', 'Barcode'], ['description', 'Description'], ['notes', 'Contributor notes'],
];

// Desktop-leaning review workspace (Stage 4): permission-aware queue,
// submission detail with source images beside metadata, comment thread,
// and the three decisions. Request-changes and reject require a written
// reason — the server refuses them without one, this UI just says so first.
export default function CaptureReview() {
  const [queue, setQueue] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const loadQueue = (filter = statusFilter) =>
    captureApi.reviewQueue(filter)
      .then(({ sessions }) => setQueue(sessions))
      .catch((err) => {
        console.error('Capture review API error:', err);
        setStatus('Could not reach the review service.');
        setQueue([]);
      });

  useEffect(() => { loadQueue(); }, [statusFilter]);

  const openDetail = async (id) => {
    setBusy(true);
    setStatus('');
    setReason('');
    try {
      setDetail(await captureApi.get(id));
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refreshDetail = async () => setDetail(await captureApi.get(detail.session.id));

  const act = async (work, requiresReason = false) => {
    if (requiresReason && !reason.trim()) {
      setStatus('Write a reason for the contributor first.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      await work();
      await refreshDetail();
      setReason('');
      loadQueue();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      await captureApi.addComment(detail.session.id, comment);
      setComment('');
      await refreshDetail();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!queue) {
    return <div className="control-sublabel">{status || 'Loading review queue…'}</div>;
  }

  if (detail) {
    const { session, fields, assets, comments } = detail;
    const field = (key) => fields.find((f) => f.fieldKey === key)?.value;
    const dims = field('dimensions') || {};
    const coverage = field('coverage') || {};
    const color = field('color') || {};
    const sources = assets.filter((a) => a.classification === 'source');
    const thumbFor = (source) => assets.find((a) => a.classification === 'derived' && a.sourceAssetId === source.id);

    return (
      <div>
        <div className="control-label">
          {session.title || 'Untitled capture'}
          <span className={`capture-status capture-status-${session.status}`}>
            {STATUS_LABELS[session.status] || session.status}
          </span>
        </div>
        <div className="control-sublabel">
          {session.category || 'no category'} · completeness {session.completeness}%
          {session.submittedAt && <> · submitted {new Date(session.submittedAt).toLocaleString()}</>}
        </div>

        <div className="capture-review-layout">
          <div>
            <div className="field-label">Source images</div>
            {sources.length === 0 && <div className="control-sublabel">No images were submitted.</div>}
            {sources.map((asset) => (
              <div className="capture-photo-slot" key={asset.id}>
                <div className="capture-photo-slot-title">{asset.purpose}</div>
                <a href={captureAssetBlobUrl(session.id, asset.id)} target="_blank" rel="noreferrer">
                  <img
                    className="capture-photo-thumb"
                    src={captureAssetBlobUrl(session.id, (thumbFor(asset) || asset).id)}
                    alt={`${asset.purpose} photo — opens full size for zoom`}
                  />
                </a>
                <div className="control-sublabel">
                  {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                  {(asset.sizeBytes / 1024).toFixed(0)} KB
                  {asset.captureMetadata?.qualityWarnings?.includes('low_resolution') && ' · ⚠ low resolution'}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="field-label">Metadata</div>
            <table className="capture-review-table">
              <tbody>
                {FIELD_ROWS.map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{field(key) || '—'}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Dimensions</th>
                  <td>
                    {['width', 'length', 'thickness'].filter((k) => dims[k]).map((k) => `${k} ${dims[k]} ${dims.unit}`).join(', ') || '—'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Exposure</th>
                  <td>{coverage.exposure ? `${coverage.exposure} ${dims.unit || ''}` : '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Color (approximate)</th>
                  <td>
                    {color.hex && <span className="capture-color-chip" style={{ background: color.hex }} aria-hidden="true" />}
                    {color.name || color.hex || '—'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="field-label">Comments</div>
            {comments.length === 0 && <div className="control-sublabel">No comments yet.</div>}
            <ul className="capture-comment-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <span className="capture-comment-author">{c.authorLabel || 'Reviewer'}</span>
                  {' · '}{new Date(c.createdAt).toLocaleString()}
                  <div>{c.body}</div>
                </li>
              ))}
            </ul>
            <textarea
              className="control-select"
              rows={2}
              value={comment}
              disabled={busy}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment for the record"
              aria-label="New comment"
            />
            <button type="button" className="btn-secondary" onClick={handleComment} disabled={busy || !comment.trim()}>
              Add Comment
            </button>

            <div className="field-label">Decision</div>
            {session.status === 'submitted' && (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => act(() => captureApi.startReview(session.id))}
              >
                Start Review
              </button>
            )}
            {session.status === 'in_review' && (
              <>
                <label className="field-label" htmlFor="review-reason">Reason (required for changes/reject)</label>
                <textarea
                  id="review-reason"
                  className="control-select"
                  rows={2}
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What must change, or why it is rejected"
                />
                <div className="export-buttons">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => act(() => captureApi.decideReview(session.id, 'approve', reason))}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => act(() => captureApi.decideReview(session.id, 'request_changes', reason), true)}
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => act(() => captureApi.decideReview(session.id, 'reject', reason), true)}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
            {['approved', 'publishing'].includes(session.status) && (
              <>
                <div className="control-sublabel">
                  {session.status === 'publishing'
                    ? 'A previous publication attempt did not finish — publishing again is safe.'
                    : 'Approved. Publishing creates a company-private Library product with a stable ID and version.'}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => act(() => captureApi.publish(session.id))}
                >
                  {session.status === 'publishing' ? 'Retry Publish' : 'Publish to Library'}
                </button>
              </>
            )}
            {session.status === 'published' && (
              <div className="control-sublabel">
                Published to the Library — product <code>{session.publishedRecordId}</code>,
                version {session.publishedVersion}. Studio selections pin this exact version;
                future Library changes are offered as explicit upgrades, never applied silently.
              </div>
            )}
            {!['submitted', 'in_review', 'approved', 'publishing', 'published'].includes(session.status) && (
              <div className="control-sublabel">No decision available in this status.</div>
            )}
          </div>
        </div>

        <div className="export-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setDetail(null); setStatus(''); loadQueue(); }}
            disabled={busy}
          >
            Back to Queue
          </button>
        </div>
        {status && <div className="control-sublabel" role="status">{status}</div>}
      </div>
    );
  }

  return (
    <div>
      <label className="field-label" htmlFor="review-status-filter">Filter by status</label>
      <select
        id="review-status-filter"
        className="control-select"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        {QUEUE_STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {status && <div className="control-sublabel" role="status">{status}</div>}
      {queue.length === 0 ? (
        <div className="control-sublabel">Nothing waiting for review.</div>
      ) : (
        <ul className="capture-list">
          {queue.map((session) => (
            <li key={session.id}>
              <button type="button" className="capture-item" onClick={() => openDetail(session.id)} disabled={busy}>
                <span className="capture-item-title">{session.title || 'Untitled capture'}</span>
                <span className="control-sublabel">
                  {session.category || 'no category'} · completeness {session.completeness}%
                  {session.submittedAt && <> · {new Date(session.submittedAt).toLocaleString()}</>}
                </span>
                <span className={`capture-status capture-status-${session.status}`}>
                  {STATUS_LABELS[session.status] || session.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
