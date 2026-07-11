import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RAL_COLORS, colorById } from '../data/colors.js';

const SERIES_ORDER = ['Icecrystal Relief', 'Printech Woodgrain', 'Wrinkle Coating'];
const POPOVER_WIDTH = 520;

// Wrinkle/Icecrystal are both real RAL-coded finishes, so the code reads
// clearly on its own; Printech Woodgrain has no RAL code (just a supplier
// wood-grain name), so it shows the name instead.
function formatColorLabel(color) {
  if (color.series === 'Wrinkle Coating') return `Wrinkle ${color.code}`;
  if (color.series === 'Icecrystal Relief') return `Crystal ${color.code}`;
  return color.name;
}

// `mixed`: when different facets of this component (e.g. some roof slopes
// overridden to their own color) don't all share the same effective color,
// there's no single color to show — the button reads "Various Colors"
// instead of just whatever the global default happens to be.
export default function ColorPickerButton({ selectedId, onChange, disabled, mixed }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const selected = colorById(selectedId);

  // Positioned via a fixed-position rect computed from the button itself
  // rather than a plain CSS-anchored absolute overlay — the controls sidebar
  // scrolls (overflow-y: auto), which would otherwise clip the popover
  // instead of letting it float above everything.
  //
  // Flips above the button (instead of always opening downward) when
  // there's more room there, and always clamps its own max-height to
  // whatever space is actually available in the viewport — a button near
  // the bottom of the screen previously pushed the popover past the
  // viewport edge with no way to reach the rest of it, since it's
  // position: fixed and page-scroll is deliberately disabled while it's open.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const MARGIN = 8;
    const place = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(MARGIN, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - MARGIN));
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;
      if (spaceBelow >= spaceAbove) {
        setPos({ top: rect.bottom + 6, left, maxHeight: spaceBelow });
      } else {
        setPos({ bottom: window.innerHeight - rect.top + 6, left, maxHeight: spaceAbove });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDocPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    // Any ancestor scrolling (the sidebar, the page) invalidates the
    // computed position — simplest correct fix is to just close it.
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <div className="color-picker-btn-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className="color-picker-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={mixed ? 'Various colors across facets' : `${selected.name} — ${selected.code} (${selected.series})`}
      >
        {mixed ? (
          <span className="color-picker-btn-swatch color-picker-btn-swatch-mixed" />
        ) : (
          <span
            className="color-picker-btn-swatch"
            style={selected.thumbnail ? { backgroundImage: `url(${selected.thumbnail})` } : { background: selected.hex }}
          />
        )}
        <span className="color-picker-btn-label">{mixed ? 'Various Colors' : formatColorLabel(selected)}</span>
      </button>

      {open && pos && (
        <div
          className="color-picker-popover"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: Math.min(620, pos.maxHeight) }}
        >
          {SERIES_ORDER.map((series) => (
            <details key={series} className="color-series" open>
              <summary className="color-series-label">
                {series}
                {!mixed && selected.series === series && <span className="color-series-current"> — {selected.name}</span>}
              </summary>
              <div className="color-grid">
                {RAL_COLORS.filter((c) => c.series === series).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`color-swatch${!mixed && selectedId === c.id ? ' selected' : ''}`}
                    style={c.thumbnail ? { backgroundImage: `url(${c.thumbnail})` } : { background: c.hex }}
                    title={`${c.name} — ${c.code}`}
                    aria-label={`${c.name} ${c.code}`}
                    onClick={() => { onChange(c.id); setOpen(false); }}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
