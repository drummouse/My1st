import { allRoofProducts, allWallProducts } from '../data/pricing.js';
import { allColors } from '../data/colors.js';
import { displayMeasurement, unitPriceToDisplay } from '../lib/units.js';

const SERIES_ORDER = ['Icecrystal Relief', 'Printech Woodgrain', 'Wrinkle Coating'];

export default function FacetInspector({
  facet, effectiveProductId, effectiveColorId, hasOverride, onProductChange, onColorChange,
  onClear, onClose, unitSystem = 'imperial',
}) {
  if (!facet) return null;
  const products = facet.role === 'roof' ? allRoofProducts() : allWallProducts();
  const roleLabel = facet.role === 'roof' ? 'Roof' : 'Wall';
  const colors = allColors();
  const seriesList = [...SERIES_ORDER, ...new Set(colors.map((c) => c.series).filter((s) => !SERIES_ORDER.includes(s)))];
  const facetArea = displayMeasurement(facet.sizeSf, 'sqft', unitSystem);

  return (
    <div className="facet-inspector">
      <div className="facet-inspector-header">
        <span>{roleLabel} Facet {facet.faceId}</span>
        <button type="button" className="facet-inspector-close" onClick={onClose} aria-label="Close facet inspector">×</button>
      </div>
      <div className="facet-inspector-meta">
        {facetArea.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {facetArea.unit}{facet.pitch ? ` · ${facet.pitch}/12 pitch` : ''}
      </div>

      <label className="field-label" htmlFor="facet-product">Material</label>
      <select id="facet-product" className="control-select" value={effectiveProductId} onChange={(e) => onProductChange(e.target.value)}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} — ${unitPriceToDisplay(p.pricePerSqft, 'sqft', unitSystem).toFixed(2)}/{facetArea.unit}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="facet-color">Color</label>
      <select id="facet-color" className="control-select" value={effectiveColorId} onChange={(e) => onColorChange(e.target.value)}>
        {seriesList.map((series) => (
          <optgroup key={series} label={series}>
            {colors.filter((c) => c.series === series).map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.code}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {hasOverride && (
        <button type="button" className="btn-secondary" onClick={onClear}>Clear override (use global)</button>
      )}
    </div>
  );
}
