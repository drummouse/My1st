import StudioButton from './ui/StudioButton.jsx';

const STEP_DESCRIPTIONS = Object.freeze({
  project: 'Project Details',
  roof: 'Materials & Colors',
  siding: 'Materials & Colors',
  accents: 'Colors & Styles',
  services: 'Add-ons & Extras',
  review: 'Estimate & Proposal',
});

const isCompleted = (completedSteps, stepKey) => completedSteps?.includes(stepKey);

export default function GuidedStepRail({ steps, activeStep, completedSteps, onStepChange }) {
  return (
    <nav className="guided-step-rail" aria-label="Guided workflow steps">
      <ol>
        {steps.map((step, index) => {
          const active = step.key === activeStep;
          const completed = isCompleted(completedSteps, step.key);
          const description = step.description || STEP_DESCRIPTIONS[step.key];

          return (
            <li key={step.key} className={active ? 'is-active' : completed ? 'is-completed' : ''}>
              <StudioButton
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.label}. ${description}${completed ? ', complete' : ''}`}
                onClick={() => onStepChange(step.key)}
                variant={active ? 'primary' : 'secondary'}
              >
                <span className="guided-step-number" aria-hidden="true">{index + 1}</span>
                <span className="guided-step-copy">
                  <strong>{step.label}</strong>
                  <small>{description}</small>
                  {active && <span className="guided-step-state"> (Current step)</span>}
                  {completed && <span className="guided-step-state"> (Complete)</span>}
                </span>
              </StudioButton>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
