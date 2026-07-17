const CONTENT_BY_STEP = {
  project: 'projectContent',
  roof: 'roofContent',
  siding: 'sidingContent',
  accents: 'accentsContent',
  services: 'servicesContent',
  review: 'reviewContent',
};

export default function SalesStepContent({ activeStep, ...content }) {
  const contentKey = CONTENT_BY_STEP[activeStep] || 'projectContent';

  return content[contentKey] || null;
}
