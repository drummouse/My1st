import { useId, useState } from 'react';
import { feetFromDisplay, feetToDisplay, linearUnit } from '../lib/units.js';
import { useModelPositioning } from './workspaces/ViewerStage.jsx';

const AXES = [
  { key: 'dz', label: 'Vertical', min: -60, max: 60 },
  { key: 'dx', label: 'East/West', min: -60, max: 60 },
  { key: 'dy', label: 'North/South', min: -60, max: 60 },
];

const ZERO_OFFSET = { dx: 0, dy: 0, dz: 0 };
const STEP = 0.5;
const COARSE_STEP = 5;

export default function AssemblyAdjustment({
  layers,
  layerOffsets,
  activeLayerId,
  onActiveLayerChange,
  onChange,
  onReset,
  unitSystem = 'imperial',
  open,
  onClose,
  onOpen,
}) {
  const positioning = useModelPositioning();
  const [localOpen, setLocalOpen] = useState(true);
  const bodyId = useId();
  const panelOpen = open ?? positioning?.positioningOpen ?? localOpen;
  const closePanel = onClose ?? positioning?.onClose ?? (() => setLocalOpen(false));
  const openPanel = onOpen ?? positioning?.onOpen ?? (() => setLocalOpen(true));

  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0];
  if (!activeLayer) return null;
  const offset = layerOffsets?.[activeLayer.id] || ZERO_OFFSET;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const setAxis = (key, min, max) => (val) =>
    onChange(activeLayer.id, { ...offset, [key]: clamp(val, min, max) });
  const nudge = (key, min, max) => (delta) =>
    setAxis(key, min, max)((offset[key] || 0) + delta);
  const displayOffset = (value) => feetToDisplay(value || 0, unitSystem);
  const canonicalOffset = (value) => feetFromDisplay(value, unitSystem);
  const displayStep = feetToDisplay(STEP, unitSystem);
  const displayUnit = linearUnit(unitSystem);
  const coarseStep = feetToDisplay(COARSE_STEP, unitSystem);
  const coarseStepLabel = `${Number(coarseStep.toFixed(unitSystem === 'metric' ? 2 : 0))} ${displayUnit}`;

  if (!panelOpen) {
    return (
      <button
        type="button"
        className="model-positioning-launcher"
        aria-label="Open model positioning"
        onClick={openPanel}
      >
        Model Positioning
      </button>
    );
  }

  return (
    <section className="assembly-dock" aria-label="Model positioning">
      <div className="assembly-dock-header">
        <span>Model Positioning</span>
        <button
          type="button"
          className="assembly-dock-close"
          aria-label="Close model positioning"
          aria-controls={bodyId}
          onClick={closePanel}
        >
          ×
        </button>
      </div>

      <div id={bodyId} className="assembly-dock-body">
        {layers.length > 1 && (
          <select
            className="control-select assembly-dock-select"
            value={activeLayer.id}
            onChange={(e) => onActiveLayerChange(e.target.value)}
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {AXES.map(({ key, label, min, max }) => (
          <div key={key} className="adjust-row adjust-row-compact">
            <label htmlFor={`adjust-${key}`}>{label}</label>
            <input
              id={`adjust-${key}`}
              className="adjust-range"
              type="range"
              min={feetToDisplay(min, unitSystem)}
              max={feetToDisplay(max, unitSystem)}
              step={displayStep}
              value={displayOffset(offset[key])}
              onChange={(e) => setAxis(key, min, max)(canonicalOffset(Number(e.target.value)))}
            />
            <div className="adjust-axis-actions">
              <button
                type="button"
                className="adjust-major-action"
                aria-label={`Decrease ${label} offset by ${coarseStepLabel}`}
                onClick={() => nudge(key, min, max)(-COARSE_STEP)}
              >−</button>
              <div className="adjust-number-stepper">
                <input
                  type="number"
                  className="adjust-number"
                  min={feetToDisplay(min, unitSystem)}
                  max={feetToDisplay(max, unitSystem)}
                  value={displayOffset(offset[key])}
                  step={displayStep}
                  aria-label={`${label} offset in ${displayUnit}`}
                  onChange={(e) => setAxis(key, min, max)(canonicalOffset(Number(e.target.value) || 0))}
                />
                <div className="adjust-arrow-actions">
                  <button
                    type="button"
                    aria-label={`Decrease ${label} offset`}
                    onClick={() => nudge(key, min, max)(-STEP)}
                  >▼</button>
                  <button
                    type="button"
                    aria-label={`Increase ${label} offset`}
                    onClick={() => nudge(key, min, max)(STEP)}
                  >▲</button>
                </div>
              </div>
              <button
                type="button"
                className="adjust-major-action"
                aria-label={`Increase ${label} offset by ${coarseStepLabel}`}
                onClick={() => nudge(key, min, max)(COARSE_STEP)}
              >+</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn-secondary assembly-dock-reset" onClick={() => onReset(activeLayer.id)}>
          Reset to auto-stack
        </button>
      </div>
    </section>
  );
}
