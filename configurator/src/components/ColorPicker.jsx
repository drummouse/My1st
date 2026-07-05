import { RAL_COLORS, colorById } from '../data/colors.js';

const SERIES_ORDER = ['Icecrystal Relief', 'Printech Woodgrain', 'Wrinkle Coating'];

export default function ColorPicker({ label, selectedId, onChange }) {
  const selected = colorById(selectedId);
  return (
    <div className="control-block">
      <div className="control-label">{label}</div>
      {SERIES_ORDER.map((series) => (
        <div key={series} className="color-series">
          <div className="color-series-label">{series}</div>
          <div className="color-grid">
            {RAL_COLORS.filter((c) => c.series === series).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`color-swatch${selectedId === c.id ? ' selected' : ''}`}
                style={c.thumbnail ? { backgroundImage: `url(${c.thumbnail})` } : { background: c.hex }}
                title={`${c.name} — ${c.code}`}
                aria-label={`${c.name} ${c.code}`}
                onClick={() => onChange(c.id)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="control-sublabel">{selected.name} — {selected.code} ({selected.series})</div>
    </div>
  );
}
