import { useMemo, useState } from 'react';
import Viewer3D from './components/Viewer3D.jsx';
import BrandToggle from './components/BrandToggle.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import ProductSelector from './components/ProductSelector.jsx';
import ServicesPanel from './components/ServicesPanel.jsx';
import PriceSummary from './components/PriceSummary.jsx';
import PhotoOverlayControl from './components/PhotoOverlayControl.jsx';
import AssemblyAdjustment from './components/AssemblyAdjustment.jsx';
import { parseAppliCadXML, roofSqft, wallSqft } from './lib/roofRulerParser.js';
import { calculateEstimate } from './lib/pricingEngine.js';
import { buildEstimateText, downloadTextFile } from './lib/exportEstimate.js';
import { ROOF_PRODUCTS, ROOF_PROFILES, WALL_PRODUCTS, WALL_PROFILES, GUTTER_OPTIONS } from './data/pricing.js';
import { colorById } from './data/colors.js';
import { BRANDS } from './data/brands.js';
import { SAMPLE_HOUSE } from './data/sampleHouse.js';

const DEFAULT_SERVICES = {
  soffit: true,
  fascia: true,
  gutters: true,
  downspouts: true,
  snowRetention: false,
  capFlashing: false,
  garageDoorCapping: false,
};

export default function App() {
  const [brandId, setBrandId] = useState('ironwrap');
  const [house] = useState(SAMPLE_HOUSE);

  const [roofProductId, setRoofProductId] = useState(ROOF_PRODUCTS[0].id);
  const [roofProfile, setRoofProfile] = useState(ROOF_PROFILES[ROOF_PRODUCTS[0].id]?.[0] || '');
  const [roofColorId, setRoofColorId] = useState('wk-04'); // Graphite Grey (RAL 7024)

  const [wallProductId, setWallProductId] = useState(WALL_PRODUCTS[0].id);
  const [wallProfile, setWallProfile] = useState(WALL_PROFILES[WALL_PRODUCTS[0].id]?.[0] || '');
  const [wallColorId, setWallColorId] = useState('wk-01'); // Jet Black (Wrinkle Coating)

  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [gutterOptionId, setGutterOptionId] = useState(GUTTER_OPTIONS[0].id);
  const [measurements, setMeasurements] = useState(house.measurements);
  const [photoOverlay, setPhotoOverlay] = useState(null);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [roofOffset, setRoofOffset] = useState({ dx: 0, dy: 0, dz: 0 });

  const brand = BRANDS[brandId];

  const roofParsed = useMemo(() => parseAppliCadXML(house.roofXml, 'Roof'), [house]);
  const wallParsed = useMemo(() => parseAppliCadXML(house.wallXml, 'Wall'), [house]);

  const liveMeasurements = useMemo(
    () => ({
      roofSqft: roofSqft(roofParsed),
      wallSqft: wallSqft(wallParsed),
      ...measurements,
    }),
    [roofParsed, wallParsed, measurements]
  );

  const estimate = useMemo(
    () =>
      calculateEstimate(liveMeasurements, {
        roofProduct: roofProductId,
        wallProduct: wallProductId,
        services,
        gutterOption: gutterOptionId,
        manualDiscount,
      }),
    [liveMeasurements, roofProductId, wallProductId, services, gutterOptionId, manualDiscount]
  );

  const handleRoofProductChange = (id) => {
    setRoofProductId(id);
    setRoofProfile(ROOF_PROFILES[id]?.[0] || '');
  };
  const handleWallProductChange = (id) => {
    setWallProductId(id);
    setWallProfile(WALL_PROFILES[id]?.[0] || '');
  };

  const handleExport = () => {
    const text = buildEstimateText({
      brand,
      house,
      roofProduct: ROOF_PRODUCTS.find((p) => p.id === roofProductId),
      roofColorId,
      roofProfile,
      wallProduct: WALL_PRODUCTS.find((p) => p.id === wallProductId),
      wallColorId,
      wallProfile,
      estimate,
    });
    downloadTextFile(`${house.jobNumber}-estimate.txt`, text);
  };

  return (
    <div className="app" style={{ '--brand-accent': brand.accent, '--brand-accent-dark': brand.accentDark }}>
      <header className="app-header">
        <div>
          <div className="app-title">{brand.name} 3D Configurator</div>
          <div className="app-subtitle">{brand.tagline} — Job {house.jobNumber} · {house.customerName}</div>
        </div>
        <BrandToggle brandId={brandId} onChange={setBrandId} />
      </header>

      <main className="app-body">
        <section className="viewer-pane">
          <Viewer3D
            roofParsed={roofParsed}
            wallParsed={wallParsed}
            roofColor={colorById(roofColorId).hex}
            wallColor={colorById(wallColorId).hex}
            photoOverlay={photoOverlay}
            roofOffset={roofOffset}
          />
        </section>

        <aside className="controls-pane">
          <ProductSelector
            label="Roof Material"
            products={ROOF_PRODUCTS}
            profiles={ROOF_PROFILES}
            selectedId={roofProductId}
            selectedProfile={roofProfile}
            onProductChange={handleRoofProductChange}
            onProfileChange={setRoofProfile}
          />
          <ColorPicker label="Roof Color" selectedId={roofColorId} onChange={setRoofColorId} />

          <ProductSelector
            label="Siding Material"
            products={WALL_PRODUCTS}
            profiles={WALL_PROFILES}
            selectedId={wallProductId}
            selectedProfile={wallProfile}
            onProductChange={handleWallProductChange}
            onProfileChange={setWallProfile}
          />
          <ColorPicker label="Siding Color" selectedId={wallColorId} onChange={setWallColorId} />

          <ServicesPanel
            services={services}
            onServicesChange={setServices}
            measurements={measurements}
            onMeasurementsChange={setMeasurements}
            gutterOptionId={gutterOptionId}
            onGutterOptionChange={setGutterOptionId}
          />

          <PhotoOverlayControl photoOverlay={photoOverlay} onChange={setPhotoOverlay} />

          <AssemblyAdjustment
            offset={roofOffset}
            onChange={setRoofOffset}
            onReset={() => setRoofOffset({ dx: 0, dy: 0, dz: 0 })}
          />

          <PriceSummary estimate={estimate} manualDiscount={manualDiscount} onManualDiscountChange={setManualDiscount} />

          <button type="button" className="btn-primary" onClick={handleExport}>
            Export Estimate
          </button>
        </aside>
      </main>
    </div>
  );
}
