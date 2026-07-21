import { STUDIO_STEPS, getStudioStep, nextStudioStep, previousStudioStep } from '../../lib/studioSteps.js';
import EstimateDock from '../EstimateDock.jsx';
import GuidedStepRail from '../GuidedStepRail.jsx';
import MobileWorkspaceHeader from './MobileWorkspaceHeader.jsx';

const MOBILE_STEP_DESCRIPTIONS = Object.freeze({
  project: 'Project Details',
  roof: 'Materials & Colors',
  siding: 'Materials & Colors',
  accents: 'Colors & Styles',
  services: 'Add-ons & Extras',
  review: 'Estimate & Proposal',
});

export default function SalesModeShell({
  embedded = false,
  topBar,
  steps = STUDIO_STEPS,
  activeStep,
  onStepChange,
  viewerStage,
  inspector,
  estimate,
  onPrevious,
  onNext,
  onOpenNavigation,
}) {
  const currentStep = getStudioStep(activeStep);
  const suppliedSteps = new Map((steps || STUDIO_STEPS).map((step) => [step.key, step]));
  const orderedSteps = STUDIO_STEPS.map((step) => suppliedSteps.get(step.key) || step);
  const currentStepIndex = STUDIO_STEPS.indexOf(currentStep);
  const completedSteps = STUDIO_STEPS.slice(0, currentStepIndex).map((step) => step.key);
  const estimateContent = estimate?.content ?? estimate;

  return (
    <div className={`${embedded ? 'workspace-shell' : 'workspace-root'} sales-workspace`} data-workspace-mode="sales">
      <div className="sales-workspace-top" id="sales-navigation-drawer" popover="auto">{topBar}</div>
      <div className="sales-workspace-rail">
        <GuidedStepRail
          activeStep={currentStep.key}
          completedSteps={completedSteps}
          onStepChange={onStepChange}
          steps={orderedSteps}
        />
      </div>
      {viewerStage && <div className="sales-workspace-viewer">{viewerStage}</div>}
      <aside className="sales-workspace-inspector"
        aria-label={`${currentStep.label} controls`}
        data-control-surface
      >
        <div className="sales-workspace-active-panel">{inspector}</div>
        <EstimateDock
          activeStep={currentStep.label}
          atFirstStep={currentStep.key === STUDIO_STEPS[0].key}
          atLastStep={currentStep.key === STUDIO_STEPS.at(-1).key}
          className="sales-workspace-estimate workspace-primary-actions"
          estimate={estimate}
          nextLabel={estimate?.nextLabel || 'Next Step'}
          nextReady={estimate?.nextReady !== false}
          onPrevious={() => onPrevious?.(previousStudioStep(currentStep.key).key)}
          onNext={() => onNext?.(nextStudioStep(currentStep.key).key)}
        >
          {estimateContent}
        </EstimateDock>
      </aside>
      <div className="sales-workspace-mobile-header">
        <MobileWorkspaceHeader
          menuTarget="sales-navigation-drawer"
          mode="sales"
          onMenu={onOpenNavigation}
          step={{
            description: suppliedSteps.get(currentStep.key)?.description || MOBILE_STEP_DESCRIPTIONS[currentStep.key],
            label: currentStep.label,
            number: currentStepIndex + 1,
          }}
        />
      </div>
    </div>
  );
}
