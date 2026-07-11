import { useEffect, useRef, useState } from 'react';
import { RAL_COLORS, colorById } from '../data/colors.js';

const SERIES_ORDER = ['Wrinkle Coating', 'Icecrystal Relief', 'Printech Woodgrain'];

// Same touch/desktop signal used by the Position dock (AssemblyAdjustment.jsx)
// — a combined pointer+width check so a wide touchscreen laptop still gets
// the desktop treatment, not just any device that happens to support touch.
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse) and (max-width: 900px)').matches;

// Wrinkle/Icecrystal are both real RAL-coded finishes, so the code reads
// clearly on its own; Printech Woodgrain has no RAL code (just a supplier
// wood-grain name), so it shows the name instead.
function formatColorLabel(color) {
  if (color.series === 'Wrinkle Coating') return `Wrinkle ${color.code}`;
  if (color.series === 'Icecrystal Relief') return `Crystal ${color.code}`;
  return color.name;
}

function swatchStyle(color) {
  return color.thumbnail ? { backgroundImage: `url(${color.thumbnail})` } : { background: color.hex };
}

// Desktop: a centered modal — tabs switch series, a card grid shows bigger,
// more tactile swatches (name + code visible without hovering). Chosen over
// an anchored popover specifically to avoid the viewport-collision bug class
// entirely (no position math — it's just centered).
function SampleBoardModal({ selectedId, mixed, onChange, onClose }) {
  const [series, setSeries] = useState(() => colorById(selectedId).series);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="color-modal-backdrop" onClick={onClose}>
      <div className="color-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Choose a color">
        <div className="color-modal-header">
          <div className="color-tabs">
            {SERIES_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`color-tab${series === s ? ' active' : ''}`}
                onClick={() => setSeries(s)}
              >
                {s.split(' ')[0]}
              </button>
            ))}
          </div>
          <button type="button" className="layer-remove-btn" onClick={onClose} aria-label="Close color picker">×</button>
        </div>
        <div className="color-card-grid">
          {RAL_COLORS.filter((c) => c.series === series).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`color-card${!mixed && selectedId === c.id ? ' selected' : ''}`}
              onClick={() => { onChange(c.id); onClose(); }}
            >
              <span className="color-card-swatch" style={swatchStyle(c)} />
              <span className="color-card-meta">
                <span className="color-card-name">{c.name}</span>
                <span className="color-card-code">{c.code}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mobile: a bottom-sheet drawer — a docked panel always fits by definition
// (no positioning math needed), searchable, collapsed by series so the
// default state stays small and thumb-scrollable.
function QuickDrawer({ selectedId, mixed, onChange, onClose }) {
  const [query, setQuery] = useState('');
  const [openSeries, setOpenSeries] = useState(() => colorById(selectedId).series);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);

  return (
    <div className="color-modal-backdrop" onClick={onClose}>
      <div className="color-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Choose a color">
        <div className="color-drawer-handle" />
        <div className="color-drawer-search">
          <input
            type="text"
            placeholder="Search name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="layer-remove-btn" onClick={onClose} aria-label="Close color picker">×</button>
        </div>
        <div className="color-drawer-body">
          {SERIES_ORDER.map((series) => {
            const items = RAL_COLORS.filter((c) => c.series === series && matches(c));
            if (q && items.length === 0) return null;
            const isOpen = q ? true : openSeries === series;
            return (
              <div key={series} className={`color-accordion${isOpen ? ' open' : ''}`}>
                <button
                  type="button"
                  className="color-accordion-head"
                  onClick={() => setOpenSeries(isOpen ? null : series)}
                >
                  <span>{series}</span>
                  <span className="color-accordion-count">{items.length}</span>
                </button>
                {isOpen && (
                  <div className="color-accordion-list">
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-drawer-row${!mixed && selectedId === c.id ? ' selected' : ''}`}
                        onClick={() => { onChange(c.id); onClose(); }}
                      >
                        <span className="color-drawer-row-swatch" style={swatchStyle(c)} />
                        <span className="color-drawer-row-name">{c.name}</span>
                        <span className="color-drawer-row-code">{c.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// `mixed`: when different facets of this component (e.g. some roof slopes
// overridden to their own color) don't all share the same effective color,
// there's no single color to show — the button reads "Various Colors"
// instead of just whatever the global default happens to be.
export default function ColorPickerButton({ selectedId, onChange, disabled, mixed }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const selected = colorById(selectedId);
  const Picker = isCoarsePointer ? QuickDrawer : SampleBoardModal;

  return (
    <div className="color-picker-btn-wrap">
      <button
        type="button"
        ref={buttonRef}
        className="color-picker-btn"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={mixed ? 'Various colors across facets' : `${selected.name} — ${selected.code} (${selected.series})`}
      >
        {mixed ? (
          <span className="color-picker-btn-swatch color-picker-btn-swatch-mixed" />
        ) : (
          <span className="color-picker-btn-swatch" style={swatchStyle(selected)} />
        )}
        <span className="color-picker-btn-label">{mixed ? 'Various Colors' : formatColorLabel(selected)}</span>
      </button>

      {open && (
        <Picker selectedId={selectedId} mixed={mixed} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
