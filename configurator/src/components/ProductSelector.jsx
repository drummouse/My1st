import { displayMeasurement, unitPriceToDisplay } from '../lib/units.js';

export default function ProductSelector({
  label, products, profiles, selectedId, selectedProfile, onProductChange, onProfileChange,
  unitSystem = 'imperial',
}) {
  const availableProfiles = profiles?.[selectedId] || [];
  const priceUnit = displayMeasurement(0, 'sqft', unitSystem).unit;
  return (
    <div className="control-block">
      <div className="control-label">{label}</div>
      <select className="control-select" value={selectedId} onChange={(e) => onProductChange(e.target.value)}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} — ${unitPriceToDisplay(p.pricePerSqft, 'sqft', unitSystem).toFixed(2)}/{priceUnit}
          </option>
        ))}
      </select>
      {availableProfiles.length > 0 && (
        <select
          className="control-select control-select-secondary"
          value={selectedProfile}
          onChange={(e) => onProfileChange(e.target.value)}
        >
          {availableProfiles.map((profile) => (
            <option key={profile} value={profile}>
              Profile: {profile}
            </option>
          ))}
        </select>
      )}
      <div className="control-sublabel">Profile/width is visual only — does not change price.</div>
    </div>
  );
}
