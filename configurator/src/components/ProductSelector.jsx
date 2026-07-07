export default function ProductSelector({ label, products, profiles, selectedId, selectedProfile, onProductChange, onProfileChange }) {
  const availableProfiles = profiles?.[selectedId] || [];
  return (
    <div className="control-block">
      <div className="control-label">{label}</div>
      <select className="control-select" value={selectedId} onChange={(e) => onProductChange(e.target.value)}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} — ${p.pricePerSqft.toFixed(2)}/sqft
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
