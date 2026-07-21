export const DEFAULT_EXPERT_TOOLS = Object.freeze([
  { key: 'select', label: 'Select Surface', implemented: true },
  { key: 'move', label: 'Move Model', implemented: false, disabledReason: 'Use the viewer positioning controls; a dedicated move tool is not available yet.' },
  { key: 'rotate', label: 'Rotate View', implemented: false, disabledReason: 'Use the viewer orbit controls; a dedicated rotate tool is not available yet.' },
  { key: 'measure', label: 'Measurements', implemented: false, disabledReason: 'Measurements appear for the selected surface; a measurement tool is not available yet.' },
  { key: 'split', label: 'Surface Split', implemented: false, disabledReason: 'Surface splitting is planned for a future release.' },
  { key: 'plane-cut', label: 'Plane Cut', implemented: false, disabledReason: 'Plane cutting is planned for a future release.' },
  { key: 'history', label: 'Undo / Redo', implemented: false, disabledReason: 'Design history is not available in this release.' },
  { key: 'takeoff', label: 'Takeoff', implemented: false, disabledReason: 'Advanced takeoff is planned for a future release.' },
  { key: 'pricing', label: 'Advanced Pricing', implemented: false, disabledReason: 'Advanced pricing tools are planned for a future release.' },
  { key: 'modifiers', label: 'Modifiers', implemented: false, disabledReason: 'Surface modifiers are planned for a future release.' },
  { key: 'proposals', label: 'Proposals', implemented: false, disabledReason: 'Proposal tools are planned for a future release.' },
  { key: 'team', label: 'Team & Projects', implemented: false, disabledReason: 'Team workspace tools are planned for a future release.' },
]);

export default function ExpertToolRail({
  tools = DEFAULT_EXPERT_TOOLS,
  activeTool,
  onToolChange,
  orientation = 'vertical',
  idPrefix = '',
}) {
  return (
    <div className="expert-tool-rail" role="toolbar" aria-label="Expert tools" aria-orientation={orientation}>
      <div className="expert-tool-rail-heading">
        <strong>Professional tools</strong>
        <span>Model workspace</span>
      </div>
      <div className="expert-tool-list">
        {tools.map((tool) => {
          const available = tool.implemented === true;
          const active = available && tool.key === activeTool;
          const reasonId = `${idPrefix}expert-tool-reason-${tool.key}`;

          return (
            <div key={tool.key} className={`expert-tool-item${active ? ' is-active' : ''}`}>
              <button
                type="button"
                data-tool-key={tool.key}
                aria-pressed={active}
                aria-disabled={available ? undefined : true}
                aria-describedby={available ? undefined : reasonId}
                onClick={() => {
                  if (available) onToolChange?.(tool.key);
                }}
              >
                <span className="expert-tool-label">{tool.label}</span>
                <span className="expert-tool-state">{active ? 'Active' : available ? 'Available' : 'Unavailable'}</span>
              </button>
              {!available && (
                <small id={reasonId} className="expert-tool-reason">
                  {tool.disabledReason || 'This tool is not available in this release.'}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
