// Official IronWrap Exteriors / i Roof Alberta finish colors, sourced from
// IronWrap_Colour_Chart.pdf via color-chart.html (PR #1, this repo).
// `id` is the unique picker key; `code` is the real manufacturer color code
// (the same RAL code can appear under more than one finish/coating system).
//
// All three series carry real photographed texture swatches (src/data/textures/,
// sourced from the company's Google Drive color folders) used as the swatch
// thumbnail and as a material texture map on the 3D model.
import amberOakThumb from './textures/amber-oak-thumb.jpg';
import amberOakTexture from './textures/amber-oak.jpg';
import driftwoodThumb from './textures/driftwood-thumb.jpg';
import driftwoodTexture from './textures/driftwood.jpg';
import goldenWalnutThumb from './textures/golden-walnut-thumb.jpg';
import goldenWalnutTexture from './textures/golden-walnut.jpg';
import rusticWengeThumb from './textures/rustic-wenge-thumb.jpg';
import rusticWengeTexture from './textures/rustic-wenge.jpg';
import honeyOakThumb from './textures/honey-oak-thumb.jpg';
import honeyOakTexture from './textures/honey-oak.jpg';
import charcoalTimberThumb from './textures/charcoal-timber-thumb.jpg';
import charcoalTimberTexture from './textures/charcoal-timber.jpg';

import icecrystal8019Thumb from './textures/icecrystal-8019-thumb.jpg';
import icecrystal8019Texture from './textures/icecrystal-8019.jpg';
import icecrystal7016Thumb from './textures/icecrystal-7016-thumb.jpg';
import icecrystal7016Texture from './textures/icecrystal-7016.jpg';
import icecrystal9005Thumb from './textures/icecrystal-9005-thumb.jpg';
import icecrystal9005Texture from './textures/icecrystal-9005.jpg';

import wrinkle9005Thumb from './textures/wrinkle-9005-thumb.jpg';
import wrinkle9005Texture from './textures/wrinkle-9005.jpg';
import wrinkle8019Thumb from './textures/wrinkle-8019-thumb.jpg';
import wrinkle8019Texture from './textures/wrinkle-8019.jpg';
import wrinkle7016Thumb from './textures/wrinkle-7016-thumb.jpg';
import wrinkle7016Texture from './textures/wrinkle-7016.jpg';
import wrinkle7024Thumb from './textures/wrinkle-7024-thumb.jpg';
import wrinkle7024Texture from './textures/wrinkle-7024.jpg';
import wrinkle8017Thumb from './textures/wrinkle-8017-thumb.jpg';
import wrinkle8017Texture from './textures/wrinkle-8017.jpg';
import wrinkle3009Thumb from './textures/wrinkle-3009-thumb.jpg';
import wrinkle3009Texture from './textures/wrinkle-3009.jpg';
import wrinkle6020Thumb from './textures/wrinkle-6020-thumb.jpg';
import wrinkle6020Texture from './textures/wrinkle-6020.jpg';
import wrinkle8004Thumb from './textures/wrinkle-8004-thumb.jpg';
import wrinkle8004Texture from './textures/wrinkle-8004.jpg';

export const RAL_COLORS = [
  // Icecrystal Relief (ThyssenKrupp Pladur) — codes verified against the
  // actual product photos (folder had 7016/9005/8019, not 8017 as first assumed)
  { id: 'cr-01', code: 'RAL 8019', name: 'Grey Brown', hex: '#544d53', series: 'Icecrystal Relief', thumbnail: icecrystal8019Thumb, texture: icecrystal8019Texture },
  { id: 'cr-02', code: 'RAL 7016', name: 'Anthracite Grey', hex: '#646b6e', series: 'Icecrystal Relief', thumbnail: icecrystal7016Thumb, texture: icecrystal7016Texture },
  { id: 'cr-03', code: 'RAL 9005', name: 'Midnight Black', hex: '#3d4552', series: 'Icecrystal Relief', thumbnail: icecrystal9005Thumb, texture: icecrystal9005Texture },

  // Printech Woodgrain (DaiDong Steel) — hex is the photo's average color (fallback only)
  { id: 'wg-01', code: 'Wood 18 (2D)', name: 'Amber Oak', hex: '#b87f2e', series: 'Printech Woodgrain', thumbnail: amberOakThumb, texture: amberOakTexture },
  { id: 'wg-02', code: 'Wood 3703 (3D)', name: 'Driftwood', hex: '#a7a29c', series: 'Printech Woodgrain', thumbnail: driftwoodThumb, texture: driftwoodTexture },
  { id: 'wg-03', code: 'Wood 18 (3D)', name: 'Golden Walnut', hex: '#be7e2f', series: 'Printech Woodgrain', thumbnail: goldenWalnutThumb, texture: goldenWalnutTexture },
  { id: 'wg-04', code: 'Wood 0202 (3D)', name: 'Rustic Wenge', hex: '#97674d', series: 'Printech Woodgrain', thumbnail: rusticWengeThumb, texture: rusticWengeTexture },
  { id: 'wg-05', code: 'Wood 3701 (3D)', name: 'Honey Oak', hex: '#a77333', series: 'Printech Woodgrain', thumbnail: honeyOakThumb, texture: honeyOakTexture },
  { id: 'wg-06', code: 'RYM-01 (3D)', name: 'Charcoal Timber', hex: '#666a6c', series: 'Printech Woodgrain', thumbnail: charcoalTimberThumb, texture: charcoalTimberTexture },

  // Wrinkle Coating (ThyssenKrupp Pladur Armotrain)
  { id: 'wk-01', code: 'RAL 9005', name: 'Jet Black', hex: '#3e4a5a', series: 'Wrinkle Coating', thumbnail: wrinkle9005Thumb, texture: wrinkle9005Texture },
  { id: 'wk-02', code: 'RAL 8019', name: 'Weathered Bark', hex: '#4e494d', series: 'Wrinkle Coating', thumbnail: wrinkle8019Thumb, texture: wrinkle8019Texture },
  { id: 'wk-03', code: 'RAL 7016', name: 'Anthracite', hex: '#4c5967', series: 'Wrinkle Coating', thumbnail: wrinkle7016Thumb, texture: wrinkle7016Texture },
  { id: 'wk-04', code: 'RAL 7024', name: 'Graphite Grey', hex: '#555a60', series: 'Wrinkle Coating', thumbnail: wrinkle7024Thumb, texture: wrinkle7024Texture },
  { id: 'wk-05', code: 'RAL 8017', name: 'Dark Chocolate', hex: '#564447', series: 'Wrinkle Coating', thumbnail: wrinkle8017Thumb, texture: wrinkle8017Texture },
  { id: 'wk-06', code: 'RAL 3009', name: 'Oxide Red', hex: '#982d27', series: 'Wrinkle Coating', thumbnail: wrinkle3009Thumb, texture: wrinkle3009Texture },
  { id: 'wk-07', code: 'RAL 6020', name: 'Velvet Green', hex: '#4c5f4d', series: 'Wrinkle Coating', thumbnail: wrinkle6020Thumb, texture: wrinkle6020Texture },
  { id: 'wk-08', code: 'RAL 8004', name: 'Terracotta', hex: '#a0553e', series: 'Wrinkle Coating', thumbnail: wrinkle8004Thumb, texture: wrinkle8004Texture },
];

// Owner-added colors from the Colors Library (Phase 6) — fetched once by
// App.jsx and pushed in here via setExtraColors(), so every existing
// consumer of colorById()/RAL_COLORS-style lookups picks up custom colors
// automatically without each call site needing to know where they came
// from. A plain module-level list (not React state) is fine here: nothing
// reads it during the render that happens before the fetch resolves except
// ColorPickerButton, which re-reads allColors() fresh every time its picker
// opens, so it never shows a stale list.
// The merged array is built once here (not on every allColors() call) —
// ColorPickerButton alone calls it on every render plus once per keystroke
// in its search box, so rebuilding via spread each time adds up and also
// hands callers a fresh array reference on every call (defeating any
// reference-equality memoization downstream).
let extraColors = [];
let mergedColors = RAL_COLORS;

export function setExtraColors(colors) {
  extraColors = Array.isArray(colors) ? colors : [];
  mergedColors = extraColors.length ? [...RAL_COLORS, ...extraColors] : RAL_COLORS;
}

export function allColors() {
  return mergedColors;
}

export function colorById(id) {
  return allColors().find((c) => c.id === id) || RAL_COLORS[0];
}
