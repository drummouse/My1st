export const STUDIO_STEPS = Object.freeze([
  Object.freeze({ key: 'project', label: 'Project', shortLabel: 'Project' }),
  Object.freeze({ key: 'roof', label: 'Roof', shortLabel: 'Roof' }),
  Object.freeze({ key: 'siding', label: 'Siding', shortLabel: 'Siding' }),
  Object.freeze({ key: 'accents', label: 'Trims & Accents', shortLabel: 'Accents' }),
  Object.freeze({ key: 'services', label: 'Services', shortLabel: 'Services' }),
  Object.freeze({ key: 'review', label: 'Review', shortLabel: 'Review' }),
]);

export const getStudioStep = (key) => STUDIO_STEPS.find((step) => step.key === key) || STUDIO_STEPS[0];

export const nextStudioStep = (key) => STUDIO_STEPS[
  Math.min(STUDIO_STEPS.indexOf(getStudioStep(key)) + 1, STUDIO_STEPS.length - 1)
];

export const previousStudioStep = (key) => STUDIO_STEPS[
  Math.max(STUDIO_STEPS.indexOf(getStudioStep(key)) - 1, 0)
];
