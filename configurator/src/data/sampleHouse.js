import roofXml from './sample/roof-report.xml?raw';
import wallXml from './sample/wall-report.xml?raw';

// Rakievich Residence, Job 26-180-ER, Gunn AB — RoofRuler exports parse the
// real roof + wall facets (see PROJECT_BRIEF.md §6). Soffit/gutter/downspout
// linear footage isn't carried in these two XML exports (that comes from a
// separate RoofRuler Soffit/Gutter Report), so those defaults are taken from
// the report totals in the brief and left editable in the UI.
//
// `layers` is an ordered list of imported RoofRuler XML files. Each layer is
// independently centered on its own footprint and stacked on top of the
// layers before it (see buildScene.js); App.jsx tracks each layer's manual
// position nudge separately (keyed by layer id), defaulting to no nudge. The
// wall layer comes first so the roof stacks on top of it, matching the
// original fixed roof+wall behavior.
export const SAMPLE_HOUSE = {
  jobNumber: '26-180-ER',
  customerName: 'Jim Rakievich',
  address: 'Gunn, AB',
  layers: [
    { id: 'wall', name: 'Wall/Siding', xml: wallXml, visible: true },
    { id: 'roof', name: 'Roof', xml: roofXml, visible: true },
  ],
  measurements: {
    soffitSqft: 2664,
    fasciaLf: 914,
    gutterLf: 431,
    downspoutLf: 112,
    snowRetentionLf: 0,
    capFlashingLf: 0,
    garageDoorCappingLf: 0,
  },
};
