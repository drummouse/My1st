import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RAL_COLORS, colorById } from '../data/colors.js';

const SERIES_ORDER = ['Icecrystal Relief', 'Printech Woodgrain', 'Wrinkle Coating'];
const POPOVER_WIDTH = 260;

// Wrinkle/Icecrystal are both real RAL-coded finishes, so the code reads
// clearly on its own; Printech Woodgrain has no RAL code (just a supplier
// wood-grain name), so it shows the name instead.
function formatColorLabel(color) {
  if (color.series === 'Wrinkle Coating') return `Wrinkle ${color.code}`;
  if (color.series === 'Icecrystal Relief') return `Crystal ${color.code}`;
  return color.name;
}

export default function ColorPickerButton({ selectedId, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const selected = colorById(selectedId);

  // Positioned via a fixed-position rect computed from the button itself
  // rather than a plain CSS-anchored absolute overlay — the controls sidebar
  // scrolls (overflow-y: auto), which would otherwise clip the popover
  // instead of letting it float above everything.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
      setPos({ top: rect.bottom + 6, left });
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
        title={`${selected.name} — ${selected.code} (${selected.series})`}
      >
        <span
          className="color-picker-btn-swatch"
          style={selected.thumbnail ? { backgroundImage: `url(${selected.thumbnail})` } : { background: selected.hex }}
        />
        <span className="color-picker-btn-label">{formatColorLabel(selected)}</span>
      </button>

      {open && pos && (
        <div className="color-picker-popover" style={{ top: pos.top, left: pos.left }}>
          {SERIES_ORDER.map((series) => (
            <details key={series} className="color-series" open={selected.series === series}>
              <summary className="color-series-label">
                {series}
                {selected.series === series && <span className="color-series-current"> — {selected.name}</span>}
              </summary>
              <div className="color-grid">
                {RAL_COLORS.filter((c) => c.series === series).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`color-swatch${selectedId === c.id ? ' selected' : ''}`}
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
