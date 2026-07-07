import { BRANDS } from '../data/brands.js';

export default function BrandToggle({ brandId, onChange }) {
  return (
    <div className="brand-toggle" role="tablist" aria-label="Brand">
      {Object.values(BRANDS).map((b) => (
        <button
          key={b.id}
          role="tab"
          aria-selected={brandId === b.id}
          className={`brand-toggle-btn${brandId === b.id ? ' active' : ''}`}
          style={brandId === b.id ? { background: b.accent, borderColor: b.accent } : undefined}
          onClick={() => onChange(b.id)}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}
