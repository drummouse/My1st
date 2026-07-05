import { RAL_COLORS } from '../data/colors.js';

export default function ColorPicker({ label, selectedCode, onChange }) {
  return (
    <div className="control-block">
      <div className="control-label">{label}</div>
      <div className="color-grid">
        {RAL_COLORS.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`color-swatch${selectedCode === c.code ? ' selected' : ''}`}
            style={{ background: c.hex }}
            title={`${c.code} — ${c.name}`}
            aria-label={`${c.code} ${c.name}`}
            onClick={() => onChange(c.code)}
          />
        ))}
      </div>
      <div className="control-sublabel">
        {RAL_COLORS.find((c) => c.code === selectedCode)?.code} — {RAL_COLORS.find((c) => c.code === selectedCode)?.name}
      </div>
    </div>
  );
}
