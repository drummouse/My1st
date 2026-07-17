import StudioButton from './ui/StudioButton.jsx';

const isCompleted = (completedSteps, stepKey) => completedSteps?.includes(stepKey);

export default function GuidedStepRail({ steps, activeStep, completedSteps, onStepChange }) {
  return (
    <nav className="guided-step-rail" aria-label="Guided workflow steps">
      <ol>
        {steps.map((step, index) => {
          const active = step.key === activeStep;
          const completed = isCompleted(completedSteps, step.key);

          return (
            <li key={step.key} className={active ? 'is-active' : completed ? 'is-completed' : ''}>
              <StudioButton
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.label}${completed ? ', complete' : ''}`}
                onClick={() => onStepChange(step.key)}
                variant={active ? 'primary' : 'secondary'}
              >
                <span aria-hidden="true">{index + 1}.</span> {step.label}
                {active && <span> (Current step)</span>}
                {completed && <span> (Complete)</span>}
              </StudioButton>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
