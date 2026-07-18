import { useId, useState } from 'react';
import { feetFromDisplay, feetToDisplay, linearUnit } from '../lib/units.js';

const AXES = [
  { key: 'dz', label: 'Vertical', min: -60, max: 60 },
  { key: 'dx', label: 'East/West', min: -60, max: 60 },
  { key: 'dy', label: 'North/South', min: -60, max: 60 },
];

const ZERO_OFFSET = { dx: 0, dy: 0, dz: 0 };
const STEP = 0.5;

// Coarse pointer (touch/tablet) can't drag a small slider thumb reliably, and
// a docked overlay this size has no room for a full-width drag target
// anyway — step buttons instead, no gesture to conflict with the 3D view's
// own single-finger-rotate/two-finger-zoom touch handling. Fine-pointer
// (mouse/trackpad) devices keep the slider, which is faster for a mouse.
// Also requires a narrow viewport: pointer:coarse alone also matches
// touchscreen laptops/2-in-1s with plenty of screen space, where the mouse-
// oriented slider is still the better fit. Computed once: pointer capability
// and viewport class don't change mid-session in practice.
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse) and (max-width: 900px)').matches;

export default function AssemblyAdjustment({ layers, layerOffsets, activeLayerId, onActiveLayerChange, onChange, onReset, unitSystem = 'imperial' }) {
  // Collapsed by default on touch (nothing should sit over the model until
  // asked for); desktop has room to just leave the mini-sliders visible.
  const [collapsed, setCollapsed] = useState(isCoarsePointer);
  const bodyId = useId();

  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0];
  if (!activeLayer) return null;
  const offset = layerOffsets?.[activeLayer.id] || ZERO_OFFSET;
  const setAxis = (key) => (val) => onChange(activeLayer.id, { ...offset, [key]: val });
  const nudge = (key, min, max) => (delta) =>
    setAxis(key)(Math.min(max, Math.max(min, (offset[key] || 0) + delta)));
  const displayOffset = (value) => feetToDisplay(value || 0, unitSystem);
  const canonicalOffset = (value) => feetFromDisplay(value, unitSystem);
  const displayStep = feetToDisplay(STEP, unitSystem);
  const displayUnit = linearUnit(unitSystem);

  return (
    <div className="assembly-dock">
      <button
        type="button"
        className="assembly-dock-toggle"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>Model Positioning</span>
        <span className="assembly-dock-chevron">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
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

          {AXES.map(({ key, label, min, max }) =>
            isCoarsePointer ? (
              <div key={key} className="adjust-stepper-row">
                <label>{label}</label>
                <div className="adjust-stepper">
                  <button type="button" onClick={() => nudge(key, min, max)(-STEP)} aria-label={`Decrease ${label}`}>−</button>
                  <span className="adjust-stepper-value">{displayOffset(offset[key]).toFixed(unitSystem === 'metric' ? 2 : 1)} {displayUnit}</span>
                  <button type="button" onClick={() => nudge(key, min, max)(STEP)} aria-label={`Increase ${label}`}>+</button>
                </div>
              </div>
            ) : (
              <div key={key} className="adjust-row adjust-row-compact">
                <label htmlFor={`adjust-${key}`}>{label}</label>
                <input
                  id={`adjust-${key}`}
                  type="range"
                  min={feetToDisplay(min, unitSystem)}
                  max={feetToDisplay(max, unitSystem)}
                  step={displayStep}
                  value={displayOffset(offset[key])}
                  onChange={(e) => setAxis(key)(canonicalOffset(Number(e.target.value)))}
                />
                <input
                  type="number"
                  className="adjust-number"
                  min={feetToDisplay(min, unitSystem)}
                  max={feetToDisplay(max, unitSystem)}
                  value={displayOffset(offset[key])}
                  step={displayStep}
                  aria-label={`${label} offset in ${displayUnit}`}
                  onChange={(e) => setAxis(key)(canonicalOffset(Number(e.target.value) || 0))}
                />
                <span className="service-unit">{displayUnit}</span>
              </div>
            )
          )}
          <button type="button" className="btn-secondary assembly-dock-reset" onClick={() => onReset(activeLayer.id)}>
            Reset to auto-stack
          </button>
        </div>
      )}
    </div>
  );
}
