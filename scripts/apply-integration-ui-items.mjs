import { readFile, writeFile, unlink } from 'node:fs/promises';

const mode = process.argv[2];

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function writeTests() {
  const testFile = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { saveOrUpdateProject } from '../src/lib/projects.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Capture is surfaced as a capability-gated administrative destination', async () => {
  const app = await readSource('../src/App.jsx');
  assert.match(app, /import CapturePanel from '.\\/components\\/CapturePanel\\.jsx';/);
  assert.match(app, /ADMINISTRATIVE_SECTIONS = new Set\\(\\['settings', 'discounts', 'customServices', 'materials', 'capture', 'platform'\\]\\)/);
  assert.match(app, /const canCapture = capabilities\\.includes\\('capture\\.create'\\)/);
  assert.match(app, /activeSection === 'capture' && canCapture[\\s\\S]*?<CapturePanel canReview=\\{capabilities\\.includes\\('capture\\.review'\\)\\} \\/>/);
  assert.match(app, /canCapture && \\(\\s*<button[\\s\\S]*?activeSection === 'capture'[\\s\\S]*?>\\s*Capture\\s*<\\/button>\\s*\\)\\}/);
});

test('project contact remains top-level metadata across open, reset, save, and share flows', async () => {
  const app = await readSource('../src/App.jsx');
  assert.match(app, /const \\[projectMetadata, setProjectMetadata\\] = useState\\(\\{ customerEmail: '', customerPhone: '' \\}\\)/);
  assert.match(app, /setProjectMetadata\\(\\{ customerEmail: '', customerPhone: '' \\}\\)/);
  assert.match(app, /customerEmail: row\\.customer_email \\|\\| ''/);
  assert.match(app, /customerPhone: row\\.customer_phone \\|\\| ''/);
  assert.equal((app.match(/saveOrUpdateProject\\([^\\n]+projectMetadata/g) || []).length, 2);
  assert.match(app, /<ProjectsPanel[\\s\\S]*?customerEmail=\\{projectMetadata\\.customerEmail\\}[\\s\\S]*?customerPhone=\\{projectMetadata\\.customerPhone\\}[\\s\\S]*?onCustomerContactChange=\\{setProjectMetadata\\}/);
});

test('Projects panel exposes email and phone inputs and restores row metadata on open', async () => {
  const panel = await readSource('../src/components/ProjectsPanel.jsx');
  assert.match(panel, /type="email"/);
  assert.match(panel, /type="tel"/);
  assert.match(panel, /onCustomerContactChange\\?\\.\\(\\{[\\s\\S]*?customerEmail: row\\.customer_email \\|\\| ''[\\s\\S]*?customerPhone: row\\.customer_phone \\|\\| ''/);
});

test('saveOrUpdateProject sends customer contact as top-level project metadata', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: 'project-1' }) };
  };
  try {
    await saveOrUpdateProject({
      pricingSettings: { gstRate: 0.05 },
      house: { jobNumber: 'J-1', customerName: 'Customer', address: 'Address' },
    }, null, {
      customerEmail: 'customer@example.com',
      customerPhone: '+17805551234',
    });
    const body = JSON.parse(request.options.body);
    assert.equal(body.customerEmail, 'customer@example.com');
    assert.equal(body.customerPhone, '+17805551234');
    assert.equal(body.design.house.customerName, 'Customer');
  } finally {
    global.fetch = originalFetch;
  }
});
`;
  await writeFile('configurator/tests/integrationUiSurfacing.test.mjs', testFile);
}

async function applyImplementation() {
  const appPath = 'configurator/src/App.jsx';
  let app = await readFile(appPath, 'utf8');
  app = replaceOnce(
    app,
    "import PlatformConsole from './components/PlatformConsole.jsx';",
    "import PlatformConsole from './components/PlatformConsole.jsx';\nimport CapturePanel from './components/CapturePanel.jsx';",
    'CapturePanel import',
  );
  app = replaceOnce(
    app,
    "const ADMINISTRATIVE_SECTIONS = new Set(['settings', 'discounts', 'customServices', 'materials', 'platform']);",
    "const ADMINISTRATIVE_SECTIONS = new Set(['settings', 'discounts', 'customServices', 'materials', 'capture', 'platform']);",
    'administrative Capture section',
  );
  app = replaceOnce(
    app,
    "  const [currentProjectId, setCurrentProjectId] = useState(null);",
    "  const [currentProjectId, setCurrentProjectId] = useState(null);\n  const [projectMetadata, setProjectMetadata] = useState({ customerEmail: '', customerPhone: '' });",
    'project metadata state',
  );
  app = replaceOnce(
    app,
    "  const canViewPlatform = capabilities.includes('platform.diagnostics.read');",
    "  const canViewPlatform = capabilities.includes('platform.diagnostics.read');\n  const canCapture = capabilities.includes('capture.create');",
    'Capture capability',
  );
  app = replaceOnce(
    app,
    "    setAttachments([]);\n    setActiveLayerId(undefined);",
    "    setAttachments([]);\n    setProjectMetadata({ customerEmail: '', customerPhone: '' });\n    setActiveLayerId(undefined);",
    'new project metadata reset',
  );
  app = replaceOnce(
    app,
    "      const saved = await saveOrUpdateProject(design, currentProjectId);",
    "      const saved = await saveOrUpdateProject(design, currentProjectId, projectMetadata);",
    'project save metadata',
  );
  app = replaceOnce(
    app,
    "        saveOrUpdateProject(state, currentProjectId),",
    "        saveOrUpdateProject(state, currentProjectId, projectMetadata),",
    'Share Design metadata',
  );
  app = replaceOnce(
    app,
    "        setCurrentProjectId(projectId);\n        markDesignPersisted(restoredDesign);",
    "        setCurrentProjectId(projectId);\n        setProjectMetadata({\n          customerEmail: row.customer_email || '',\n          customerPhone: row.customer_phone || '',\n        });\n        markDesignPersisted(restoredDesign);",
    'restored project metadata',
  );
  app = replaceOnce(
    app,
    "          house={house}\n          onSaveProject={handleSaveProject}",
    "          house={house}\n          customerEmail={projectMetadata.customerEmail}\n          customerPhone={projectMetadata.customerPhone}\n          onCustomerContactChange={setProjectMetadata}\n          onSaveProject={handleSaveProject}",
    'ProjectsPanel metadata props',
  );
  app = replaceOnce(
    app,
    "      {activeSection === 'platform' && canViewPlatform && (\n        <PlatformConsole capabilities={capabilities} />\n      )}",
    "      {activeSection === 'capture' && canCapture && (\n        <CapturePanel canReview={capabilities.includes('capture.review')} />\n      )}\n      {activeSection === 'platform' && canViewPlatform && (\n        <PlatformConsole capabilities={capabilities} />\n      )}",
    'Capture administrative content',
  );
  app = replaceOnce(
    app,
    "      {canViewPlatform && (\n        <button\n          type=\"button\"\n          aria-current={activeSection === 'platform' ? 'page' : undefined}\n          onClick={() => handleApplicationSectionChange('platform')}\n        >\n          Platform\n        </button>\n      )}",
    "      {canCapture && (\n        <button\n          type=\"button\"\n          aria-current={activeSection === 'capture' ? 'page' : undefined}\n          onClick={() => handleApplicationSectionChange('capture')}\n        >\n          Capture\n        </button>\n      )}\n      {canViewPlatform && (\n        <button\n          type=\"button\"\n          aria-current={activeSection === 'platform' ? 'page' : undefined}\n          onClick={() => handleApplicationSectionChange('platform')}\n        >\n          Platform\n        </button>\n      )}",
    'Capture navigation button',
  );
  await writeFile(appPath, app);

  const projectsPath = 'configurator/src/lib/projects.js';
  let projects = await readFile(projectsPath, 'utf8');
  projects = replaceOnce(
    projects,
    'export async function saveOrUpdateProject(design, currentProjectId) {',
    "export async function saveOrUpdateProject(design, currentProjectId, { customerEmail = '', customerPhone = '' } = {}) {",
    'project save signature',
  );
  projects = replaceOnce(
    projects,
    "      address: design.house.address,\n      design,",
    "      address: design.house.address,\n      customerEmail,\n      customerPhone,\n      design,",
    'project save body metadata',
  );
  await writeFile(projectsPath, projects);

  const panelPath = 'configurator/src/components/ProjectsPanel.jsx';
  let panel = await readFile(panelPath, 'utf8');
  panel = replaceOnce(
    panel,
    "  house,\n  onSaveProject,",
    "  house,\n  customerEmail = '',\n  customerPhone = '',\n  onCustomerContactChange,\n  onSaveProject,",
    'ProjectsPanel metadata props',
  );
  panel = replaceOnce(
    panel,
    "      const row = await res.json();\n      const restoredDesign = await onOpenProject(row.design);",
    "      const row = await res.json();\n      onCustomerContactChange?.({\n        customerEmail: row.customer_email || '',\n        customerPhone: row.customer_phone || '',\n      });\n      const restoredDesign = await onOpenProject(row.design);",
    'ProjectsPanel metadata restore',
  );
  panel = replaceOnce(
    panel,
    "      <button\n        type=\"button\"\n        className=\"btn-secondary\"\n        onClick={handleCopyProjectLink}",
    "      <div className=\"project-contact-fields\" style={{ marginTop: '0.6rem' }}>\n        <label className=\"field-label\" htmlFor=\"project-customer-email\">Customer Email</label>\n        <input\n          id=\"project-customer-email\"\n          className=\"control-select\"\n          type=\"email\"\n          autoComplete=\"email\"\n          value={customerEmail}\n          onChange={(event) => onCustomerContactChange?.({ customerEmail: event.target.value, customerPhone })}\n          placeholder=\"customer@example.com\"\n        />\n        <label className=\"field-label\" htmlFor=\"project-customer-phone\" style={{ marginTop: '0.5rem' }}>Customer Phone</label>\n        <input\n          id=\"project-customer-phone\"\n          className=\"control-select\"\n          type=\"tel\"\n          autoComplete=\"tel\"\n          value={customerPhone}\n          onChange={(event) => onCustomerContactChange?.({ customerEmail, customerPhone: event.target.value })}\n          placeholder=\"780-555-1234\"\n        />\n        <div className=\"control-sublabel\">Used for project notifications. Phone numbers are validated when the project is saved.</div>\n      </div>\n\n      <button\n        type=\"button\"\n        className=\"btn-secondary\"\n        onClick={handleCopyProjectLink}",
    'ProjectsPanel contact inputs',
  );
  await writeFile(panelPath, panel);
}

if (mode === 'tests') {
  await writeTests();
} else if (mode === 'implementation') {
  await applyImplementation();
} else if (mode === 'cleanup') {
  await unlink('scripts/apply-integration-ui-items.mjs');
  await unlink('.github/workflows/integration-ui-surfacing.yml');
} else {
  throw new Error('Expected tests, implementation, or cleanup mode.');
}
