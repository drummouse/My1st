// Official IronWrap Exteriors / i Roof Alberta finish colors, sourced from
// IronWrap_Colour_Chart.pdf via color-chart.html (PR #1, this repo).
// `id` is the unique picker key; `code` is the real manufacturer color code
// (the same RAL code can appear under more than one finish/coating system).
export const RAL_COLORS = [
  // Icecrystal Relief (ThyssenKrupp Pladur)
  { id: 'cr-01', code: 'RAL 8017', name: 'Dark Chocolate', hex: '#45322E', series: 'Icecrystal Relief' },
  { id: 'cr-02', code: 'RAL 7016', name: 'Glacial Teal', hex: '#293133', series: 'Icecrystal Relief' },
  { id: 'cr-03', code: 'RAL 9005', name: 'Midnight Black', hex: '#16181A', series: 'Icecrystal Relief' },

  // Printech Woodgrain (DaiDong Steel)
  { id: 'wg-01', code: 'Wood 18 (2D)', name: 'Amber Oak', hex: '#A07438', series: 'Printech Woodgrain' },
  { id: 'wg-02', code: 'Wood 3703 (3D)', name: 'Driftwood', hex: '#BEB4A0', series: 'Printech Woodgrain' },
  { id: 'wg-03', code: 'Wood 18 (3D)', name: 'Golden Walnut', hex: '#9A7030', series: 'Printech Woodgrain' },
  { id: 'wg-04', code: 'Wood 0202 (3D)', name: 'Rustic Wenge', hex: '#3C1E0C', series: 'Printech Woodgrain' },
  { id: 'wg-05', code: 'Wood 3701 (3D)', name: 'Honey Oak', hex: '#B08840', series: 'Printech Woodgrain' },
  { id: 'wg-06', code: 'RYM-01 (3D)', name: 'Charcoal Timber', hex: '#242422', series: 'Printech Woodgrain' },

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
