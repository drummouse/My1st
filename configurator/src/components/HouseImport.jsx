function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function HouseImport({ house, onMetaChange, onXmlImport }) {
  const handleFile = (kind) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const xml = await readFileAsText(file);
    onXmlImport(kind, xml);
    e.target.value = ''; // allow re-selecting the same filename later
  };

  return (
    <div className="control-block">
      <div className="control-label">House / Project</div>

      <label className="field-label" htmlFor="job-number">Job #</label>
      <input id="job-number" className="control-select" value={house.jobNumber} onChange={(e) => onMetaChange({ jobNumber: e.target.value })} />

      <label className="field-label" htmlFor="customer-name">Customer</label>
      <input id="customer-name" className="control-select" value={house.customerName} onChange={(e) => onMetaChange({ customerName: e.target.value })} />

      <label className="field-label" htmlFor="job-address">Address</label>
      <input id="job-address" className="control-select" value={house.address} onChange={(e) => onMetaChange({ address: e.target.value })} />

      <div className="import-row">
        <label className="btn-secondary import-file-btn" htmlFor="import-roof-xml">Import Roof Report XML</label>
        <input id="import-roof-xml" type="file" accept=".xml" onChange={handleFile('roofXml')} className="visually-hidden" />

        <label className="btn-secondary import-file-btn" htmlFor="import-wall-xml">Import Wall Report XML</label>
        <input id="import-wall-xml" type="file" accept=".xml" onChange={handleFile('wallXml')} className="visually-hidden" />
      </div>
      <div className="control-sublabel">
        Loads a different RoofRuler export in place of the current house. Soffit/fascia/gutter/downspout
        totals below reset to 0 and stay editable, since those aren't in these XML exports.
      </div>
    </div>
  );
}
