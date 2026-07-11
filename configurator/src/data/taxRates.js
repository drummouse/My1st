// Baseline sales-tax rates by jurisdiction, researched (see README) —
// state/provincial rate only; most US states also allow county/city tax on
// top, which is what Settings' separate Municipal Tax field is for. These
// are starting defaults, not authoritative: every rate is still editable in
// Settings after the region picker prefills it.
export const COUNTRIES = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
];

export const REGIONS = {
  CA: [
    { code: 'CA-AB', name: 'Alberta', rate: 0.05, label: 'GST' },
    { code: 'CA-BC', name: 'British Columbia', rate: 0.12, label: 'GST + PST' },
    { code: 'CA-MB', name: 'Manitoba', rate: 0.12, label: 'GST + RST' },
    { code: 'CA-NB', name: 'New Brunswick', rate: 0.15, label: 'HST' },
    { code: 'CA-NL', name: 'Newfoundland and Labrador', rate: 0.15, label: 'HST' },
    { code: 'CA-NS', name: 'Nova Scotia', rate: 0.14, label: 'HST' },
    { code: 'CA-NT', name: 'Northwest Territories', rate: 0.05, label: 'GST' },
    { code: 'CA-NU', name: 'Nunavut', rate: 0.05, label: 'GST' },
    { code: 'CA-ON', name: 'Ontario', rate: 0.13, label: 'HST' },
    { code: 'CA-PE', name: 'Prince Edward Island', rate: 0.15, label: 'HST' },
    { code: 'CA-QC', name: 'Quebec', rate: 0.14975, label: 'GST + QST' },
    { code: 'CA-SK', name: 'Saskatchewan', rate: 0.11, label: 'GST + PST' },
    { code: 'CA-YT', name: 'Yukon', rate: 0.05, label: 'GST' },
  ],
  US: [
    { code: 'US-AL', name: 'Alabama', rate: 0.04, label: 'State' },
    { code: 'US-AK', name: 'Alaska', rate: 0, label: 'No state sales tax' },
    { code: 'US-AZ', name: 'Arizona', rate: 0.056, label: 'State' },
    { code: 'US-AR', name: 'Arkansas', rate: 0.065, label: 'State' },
    { code: 'US-CA', name: 'California', rate: 0.0725, label: 'State' },
    { code: 'US-CO', name: 'Colorado', rate: 0.029, label: 'State' },
    { code: 'US-CT', name: 'Connecticut', rate: 0.0635, label: 'State' },
    { code: 'US-DE', name: 'Delaware', rate: 0, label: 'No state sales tax' },
    { code: 'US-FL', name: 'Florida', rate: 0.06, label: 'State' },
    { code: 'US-GA', name: 'Georgia', rate: 0.04, label: 'State' },
    { code: 'US-HI', name: 'Hawaii', rate: 0.04, label: 'General excise' },
    { code: 'US-ID', name: 'Idaho', rate: 0.06, label: 'State' },
    { code: 'US-IL', name: 'Illinois', rate: 0.0625, label: 'State' },
    { code: 'US-IN', name: 'Indiana', rate: 0.07, label: 'State' },
    { code: 'US-IA', name: 'Iowa', rate: 0.06, label: 'State' },
    { code: 'US-KS', name: 'Kansas', rate: 0.065, label: 'State' },
    { code: 'US-KY', name: 'Kentucky', rate: 0.06, label: 'State' },
    { code: 'US-LA', name: 'Louisiana', rate: 0.0445, label: 'State' },
    { code: 'US-ME', name: 'Maine', rate: 0.055, label: 'State' },
    { code: 'US-MD', name: 'Maryland', rate: 0.06, label: 'State' },
    { code: 'US-MA', name: 'Massachusetts', rate: 0.0625, label: 'State' },
    { code: 'US-MI', name: 'Michigan', rate: 0.06, label: 'State' },
    { code: 'US-MN', name: 'Minnesota', rate: 0.06875, label: 'State' },
    { code: 'US-MS', name: 'Mississippi', rate: 0.07, label: 'State' },
    { code: 'US-MO', name: 'Missouri', rate: 0.04225, label: 'State' },
    { code: 'US-MT', name: 'Montana', rate: 0, label: 'No state sales tax' },
    { code: 'US-NE', name: 'Nebraska', rate: 0.055, label: 'State' },
    { code: 'US-NV', name: 'Nevada', rate: 0.0685, label: 'State' },
    { code: 'US-NH', name: 'New Hampshire', rate: 0, label: 'No state sales tax' },
    { code: 'US-NJ', name: 'New Jersey', rate: 0.06625, label: 'State' },
    { code: 'US-NM', name: 'New Mexico', rate: 0.05125, label: 'Gross receipts' },
    { code: 'US-NY', name: 'New York', rate: 0.04, label: 'State' },
    { code: 'US-NC', name: 'North Carolina', rate: 0.0475, label: 'State' },
    { code: 'US-ND', name: 'North Dakota', rate: 0.05, label: 'State' },
    { code: 'US-OH', name: 'Ohio', rate: 0.0575, label: 'State' },
    { code: 'US-OK', name: 'Oklahoma', rate: 0.045, label: 'State' },
    { code: 'US-OR', name: 'Oregon', rate: 0, label: 'No state sales tax' },
    { code: 'US-PA', name: 'Pennsylvania', rate: 0.06, label: 'State' },
    { code: 'US-RI', name: 'Rhode Island', rate: 0.07, label: 'State' },
    { code: 'US-SC', name: 'South Carolina', rate: 0.06, label: 'State' },
    { code: 'US-SD', name: 'South Dakota', rate: 0.042, label: 'State' },
    { code: 'US-TN', name: 'Tennessee', rate: 0.07, label: 'State' },
    { code: 'US-TX', name: 'Texas', rate: 0.0625, label: 'State' },
    { code: 'US-UT', name: 'Utah', rate: 0.0485, label: 'State' },
    { code: 'US-VT', name: 'Vermont', rate: 0.06, label: 'State' },
    { code: 'US-VA', name: 'Virginia', rate: 0.043, label: 'State' },
    { code: 'US-WA', name: 'Washington', rate: 0.065, label: 'State' },
    { code: 'US-DC', name: 'Washington DC', rate: 0.06, label: 'State' },
    { code: 'US-WV', name: 'West Virginia', rate: 0.06, label: 'State' },
    { code: 'US-WI', name: 'Wisconsin', rate: 0.05, label: 'State' },
    { code: 'US-WY', name: 'Wyoming', rate: 0.04, label: 'State' },
  ],
};

export function regionByCode(code) {
  for (const list of Object.values(REGIONS)) {
    const found = list.find((r) => r.code === code);
    if (found) return found;
  }
  return null;
}
