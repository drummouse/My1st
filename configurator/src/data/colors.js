// Official IronWrap Exteriors / i Roof Alberta finish colors, sourced from
// IronWrap_Colour_Chart.pdf via color-chart.html (PR #1, this repo).
// `id` is the unique picker key; `code` is the real manufacturer color code
// (the same RAL code can appear under more than one finish/coating system).
//
// Printech Woodgrain entries carry real photographed texture swatches
// (src/data/textures/, sourced from the company's Google Drive color folder)
// used as the swatch thumbnail and as a material texture map on the 3D model.
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

export const RAL_COLORS = [
  // Icecrystal Relief (ThyssenKrupp Pladur)
  { id: 'cr-01', code: 'RAL 8017', name: 'Dark Chocolate', hex: '#45322E', series: 'Icecrystal Relief' },
  { id: 'cr-02', code: 'RAL 7016', name: 'Glacial Teal', hex: '#293133', series: 'Icecrystal Relief' },
  { id: 'cr-03', code: 'RAL 9005', name: 'Midnight Black', hex: '#16181A', series: 'Icecrystal Relief' },

  // Printech Woodgrain (DaiDong Steel) — hex is the photo's average color (fallback only)
  { id: 'wg-01', code: 'Wood 18 (2D)', name: 'Amber Oak', hex: '#b87f2e', series: 'Printech Woodgrain', thumbnail: amberOakThumb, texture: amberOakTexture },
  { id: 'wg-02', code: 'Wood 3703 (3D)', name: 'Driftwood', hex: '#a7a29c', series: 'Printech Woodgrain', thumbnail: driftwoodThumb, texture: driftwoodTexture },
  { id: 'wg-03', code: 'Wood 18 (3D)', name: 'Golden Walnut', hex: '#be7e2f', series: 'Printech Woodgrain', thumbnail: goldenWalnutThumb, texture: goldenWalnutTexture },
  { id: 'wg-04', code: 'Wood 0202 (3D)', name: 'Rustic Wenge', hex: '#97674d', series: 'Printech Woodgrain', thumbnail: rusticWengeThumb, texture: rusticWengeTexture },
  { id: 'wg-05', code: 'Wood 3701 (3D)', name: 'Honey Oak', hex: '#a77333', series: 'Printech Woodgrain', thumbnail: honeyOakThumb, texture: honeyOakTexture },
  { id: 'wg-06', code: 'RYM-01 (3D)', name: 'Charcoal Timber', hex: '#666a6c', series: 'Printech Woodgrain', thumbnail: charcoalTimberThumb, texture: charcoalTimberTexture },

  // Wrinkle Coating
  { id: 'wk-01', code: 'RAL 9005', name: 'Jet Black', hex: '#1A1616', series: 'Wrinkle Coating' },
  { id: 'wk-02', code: 'RAL 8019', name: 'Weathered Bark', hex: '#3E3535', series: 'Wrinkle Coating' },
  { id: 'wk-03', code: 'RAL 7016', name: 'Anthracite', hex: '#293133', series: 'Wrinkle Coating' },
  { id: 'wk-04', code: 'RAL 7024', name: 'Graphite Grey', hex: '#474A52', series: 'Wrinkle Coating' },
  { id: 'wk-05', code: 'RAL 8017', name: 'Dark Chocolate', hex: '#45322E', series: 'Wrinkle Coating' },
  { id: 'wk-06', code: 'RAL 3009', name: 'Oxide Red', hex: '#6C2A28', series: 'Wrinkle Coating' },
  { id: 'wk-07', code: 'RAL 6020', name: 'Velvet Green', hex: '#31382A', series: 'Wrinkle Coating' },
  { id: 'wk-08', code: 'RAL 8004', name: 'Terracotta', hex: '#8E402A', series: 'Wrinkle Coating' },
];

export function colorById(id) {
  return RAL_COLORS.find((c) => c.id === id) || RAL_COLORS[0];
}
