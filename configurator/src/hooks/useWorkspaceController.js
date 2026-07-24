import { useState } from 'react';
import { resolveExpertEntitlement, resolveStudioMode } from '../lib/studioMode.js';
import {
  enterExpert,
  enterPresentation,
  exitPresentation,
  resolveWorkspaceMode,
} from '../lib/workspaceMode.js';

export default function useWorkspaceController({
  activeSection = 'configurator',
  authenticated = false,
  capabilities = [],
  currentProjectId = null,
  publicShowroom = false,
  role = null,
  selectedFacet = null,
  showExpertMode = false,
  tenantEntitlement = false,
} = {}) {
  const [activeStudioStep, setActiveStudioStep] = useState('project');
  const [activeExpertTool, setActiveExpertTool] = useState('select');
  const [expertRequested, setExpertRequested] = useState(false);
  const [presentationWorkspace, setPresentationWorkspace] = useState(null);
  const expertEntitled = resolveExpertEntitlement({ role, tenantEntitlement });
  const workspaceSecurityContext = {
    authenticated: authenticated === true && publicShowroom !== true,
    publicShowroom: publicShowroom === true,
    expertEntitled,
    showExpertMode: showExpertMode === true,
  };
  const resolvedStudioMode = resolveStudioMode({
    isCustomerView: publicShowroom,
    activeSection,
    role,
    capabilities,
    expertRequested,
    tenantEntitlement,
    showExpertMode,
  });
  const baseWorkspaceState = {
    mode: resolveWorkspaceMode(workspaceSecurityContext),
    ...workspaceSecurityContext,
    activeStudioStep,
    activeExpertTool,
    selectedFacet,
    currentProjectId,
  };
  const resolvedWorkspaceState = resolvedStudioMode === 'expert'
    ? enterExpert(baseWorkspaceState)
    : baseWorkspaceState;
  const workspaceState = presentationWorkspace || resolvedWorkspaceState;

  const enterPresentationMode = () => {
    if (!['sales', 'expert'].includes(workspaceState.mode)) {
      throw new Error('Presentation is unavailable for this workspace.');
    }
    setPresentationWorkspace(enterPresentation({
      ...workspaceState,
      activeStudioStep,
      activeExpertTool,
      selectedFacet,
      currentProjectId,
    }));
  };

  const exitPresentationMode = () => {
    if (!presentationWorkspace) return null;
    const restoredWorkspace = exitPresentation(presentationWorkspace, workspaceSecurityContext);
    setPresentationWorkspace(null);
    setExpertRequested(restoredWorkspace.mode === 'expert');
    setActiveStudioStep(restoredWorkspace.activeStudioStep);
    setActiveExpertTool(restoredWorkspace.activeExpertTool);
    return restoredWorkspace;
  };

  return {
    activeExpertTool,
    activeStudioStep,
    cancelPresentation: () => setPresentationWorkspace(null),
    enterPresentationMode,
    exitPresentationMode,
    expertRequested,
    requestExpert: () => setExpertRequested(true),
    returnToSales: () => setExpertRequested(false),
    setActiveExpertTool,
    setActiveStudioStep,
    workspaceSecurityContext,
    workspaceState,
  };
}
