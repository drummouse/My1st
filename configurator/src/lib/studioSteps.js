export const STUDIO_STEPS = Object.freeze([
  { key: 'project', label: 'Project', shortLabel: 'Project' },
  { key: 'roof', label: 'Roof', shortLabel: 'Roof' },
  { key: 'siding', label: 'Siding', shortLabel: 'Siding' },
  { key: 'accents', label: 'Trims & Accents', shortLabel: 'Accents' },
  { key: 'services', label: 'Services', shortLabel: 'Services' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
]);

export const getStudioStep = (key) => STUDIO_STEPS.find((step) => step.key === key) || STUDIO_STEPS[0];

export const nextStudioStep = (key) => STUDIO_STEPS[
  Math.min(STUDIO_STEPS.indexOf(getStudioStep(key)) + 1, STUDIO_STEPS.length - 1)
];

export const previousStudioStep = (key) => STUDIO_STEPS[
  Math.max(STUDIO_STEPS.indexOf(getStudioStep(key)) - 1, 0)
];
