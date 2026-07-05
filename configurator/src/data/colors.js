// Starter RAL Classic palette for roof/siding color pickers.
// Hex values are common approximations of the RAL Classic swatches used in
// metal roofing/siding — swap in exact supplier swatch hex codes when available.
export const RAL_COLORS = [
  { code: 'RAL 9005', name: 'Jet Black', hex: '#0A0A0A' },
  { code: 'RAL 7024', name: 'Graphite Grey', hex: '#4A4E51' },
  { code: 'RAL 7016', name: 'Anthracite Grey', hex: '#383E42' },
  { code: 'RAL 8019', name: 'Mocha Brown', hex: '#3B2F2A' },
  { code: 'RAL 8017', name: 'Chocolate Brown', hex: '#442F29' },
  { code: 'RAL 3009', name: 'Oxide Red', hex: '#642424' },
  { code: 'RAL 6005', name: 'Moss Green', hex: '#0F4336' },
  { code: 'RAL 5011', name: 'Steel Blue', hex: '#1E2B3C' },
  { code: 'RAL 9002', name: 'Grey White', hex: '#E7EBDA' },
  { code: 'RAL 9010', name: 'Pure White', hex: '#F5F3EA' },
  { code: 'RAL 9006', name: 'White Aluminium', hex: '#A5A8A6' },
  { code: 'RAL 8004', name: 'Copper Brown', hex: '#8D4931' },
];

export function colorById(code) {
  return RAL_COLORS.find((c) => c.code === code) || RAL_COLORS[0];
}
