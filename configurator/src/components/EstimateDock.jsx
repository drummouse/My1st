import StudioButton from './ui/StudioButton.jsx';
import StudioPanel from './ui/StudioPanel.jsx';

export default function EstimateDock({ estimate, activeStep, onPrevious, onNext, atFirstStep, atLastStep, children }) {
  return (
    <StudioPanel
      as="aside"
      className="estimate-dock"
      aria-label="Estimate and step navigation"
      data-estimate-available={Boolean(estimate)}
    >
      <div className="estimate-dock-content">{children}</div>
      <nav className="estimate-dock-navigation" aria-label="Step navigation">
        <StudioButton aria-label="Previous step" disabled={atFirstStep} onClick={onPrevious}>
          Previous
        </StudioButton>
        <span className="estimate-dock-active-step" aria-live="polite">{activeStep}</span>
        <StudioButton aria-label="Next step" disabled={atLastStep} onClick={onNext} variant="primary">
          Next
        </StudioButton>
      </nav>
    </StudioPanel>
  );
}
