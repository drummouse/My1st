import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Children, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { resolveExpertEntitlement } from '../src/lib/studioMode.js';
import { createTrimAccent } from '../src/lib/trimAccents.js';
import { enterPresentation, exitPresentation } from '../src/lib/workspaceMode.js';

let vite;
let buildShowroomViewModel;
let buildShowroomMaterials;
let ShowroomCategoryRail;
let ShowroomModeShell;
let ShowroomQuoteCard;
let PresentationCatalogEditor;
let mergePresentationCatalogOptions;
let presentationCategoryForOption;
let presentationCatalogOptionFromTrimRecord;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: ShowroomCategoryRail } = await vite.ssrLoadModule('/src/components/workspaces/ShowroomCategoryRail.jsx'));
  ({
    buildShowroomViewModel,
    buildShowroomMaterials,
    PresentationCatalogEditor,
    mergePresentationCatalogOptions,
    presentationCategoryForOption,
    presentationCatalogOptionFromTrimRecord,
    ShowroomQuoteCard,
    default: ShowroomModeShell,
  } = await vite.ssrLoadModule('/src/components/workspaces/ShowroomModeShell.jsx'));
});

test.after(async () => {
  await vite?.close();
});

const categories = [
  { key: 'roof', label: 'Roof', internalUnitPrice: '$8.90 / sq ft' },
  { key: 'siding', label: 'Siding', diagnostics: 'database row 77' },
  { key: 'accents', label: 'Accents', available: false, unavailableReason: 'Not rendered by this model' },
];

const materials = [
  {
    id: 'graphite',
    label: 'Graphite',
    color: '#31353a',
    selected: true,
    internalUnitPrice: '$8.90 / sq ft',
    locked: true,
    settings: 'tenant pricing settings',
  },
  {
    id: 'driftwood',
    label: 'Driftwood',
    color: '#a8957b',
    description: 'Warm architectural finish',
  },
];

const baseProps = (overrides = {}) => ({
  sessionType: 'public',
  viewerStage: createElement('main', { 'data-viewer-stage': true }, 'Interactive home'),
  categories,
  selectedCategory: 'roof',
  onCategoryChange: () => {},
  materials,
  estimate: {
    label: 'Estimated project total',
    displayTotal: '$24,850',
    qualifier: 'Final pricing follows an on-site review.',
    internalUnitPrice: '$8.90 / sq ft',
    pricingConfiguration: 'margin=32%',
    diagnostics: 'estimate trace 99',
  },
  customerActions: {},
  ...overrides,
});

function findElements(node, predicate, matches = []) {
  if (!isValidElement(node)) return matches;
  if (predicate(node)) matches.push(node);
  Children.forEach(node.props.children, (child) => findElements(child, predicate, matches));
  return matches;
}

test('public Showroom renders only allowlisted customer-safe content', () => {
  const html = renderToStaticMarkup(createElement(ShowroomModeShell, baseProps({
    customerActions: {
      onRequestQuote: () => {},
      onApprove: () => {},
      onOpenSettings: () => {},
      onOpenPlatform: () => {},
      projectApiActions: { delete: () => {} },
      capabilities: ['platform.diagnostics.read'],
    },
  })));

  assert.match(html, /data-workspace-mode="showroom"/);
  assert.match(html, /Interactive home/);
  assert.match(html, /Estimated project total/);
  assert.match(html, /\$24,850/);
  assert.match(html, /Approve This Design/);

  for (const forbidden of [
    'Exit Presentation',
    'Project actions',
    'New Project',
    'Expert',
    '$8.90 / sq ft',
    'Locked',
    'database row 77',
    'tenant pricing settings',
    'margin=32%',
    'estimate trace 99',
    'Settings',
    'Platform',
  ]) {
    assert.doesNotMatch(html, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('Showroom constructs strict DTOs before any child receives public props', () => {
  const onCategoryChange = () => {};
  const onRequestQuote = () => {};
  const onSelect = () => {};
  const viewModel = buildShowroomViewModel({
    categories,
    selectedCategory: 'roof',
    onCategoryChange,
    materials: [{ ...materials[0], onSelect }],
    estimate: baseProps().estimate,
    customerActions: {
      onRequestQuote,
      capabilities: ['platform.diagnostics.read'],
      projectApiActions: { delete: () => {} },
    },
  });

  assert.deepEqual(viewModel.categories, [
    { key: 'roof', label: 'Roof', available: true, unavailableReason: undefined },
    { key: 'siding', label: 'Siding', available: true, unavailableReason: undefined },
    { key: 'accents', label: 'Accents', available: false, unavailableReason: 'Not rendered by this model' },
  ]);
  assert.deepEqual(viewModel.materials, [{
    id: 'graphite',
    label: 'Graphite',
    color: '#31353a',
    thumbnail: undefined,
    description: undefined,
    selected: true,
    onSelect: undefined,
  }]);
  assert.deepEqual(viewModel.estimate, {
    label: 'Estimated project total',
    displayTotal: '$24,850',
    qualifier: 'Final pricing follows an on-site review.',
  });
  assert.deepEqual(viewModel.customerActions, {
    onShowBefore: undefined,
    onShowAfter: undefined,
    onToggleFullscreen: undefined,
    onShare: undefined,
    onContact: undefined,
    onApprove: undefined,
    onRequestQuote,
    shareUnavailableReason: undefined,
  });
  assert.equal(viewModel.onCategoryChange, onCategoryChange);

  for (const category of viewModel.categories) {
    assert.deepEqual(Object.keys(category).sort(), ['available', 'key', 'label', 'unavailableReason']);
  }
  for (const material of viewModel.materials) {
    assert.deepEqual(Object.keys(material).sort(), [
      'color', 'description', 'id', 'label', 'onSelect', 'selected', 'thumbnail',
    ]);
  }
  assert.deepEqual(Object.keys(viewModel.estimate).sort(), ['displayTotal', 'label', 'qualifier']);
  assert.deepEqual(Object.keys(viewModel.customerActions).sort(), [
    'onApprove', 'onContact', 'onRequestQuote', 'onShare', 'onShowAfter', 'onShowBefore', 'onToggleFullscreen',
    'shareUnavailableReason',
  ]);

  const shell = ShowroomModeShell(baseProps({
    categories,
    materials: [{ ...materials[0], onSelect }],
    estimate: baseProps().estimate,
    customerActions: {
      onRequestQuote,
      projectApiActions: { delete: () => {} },
    },
  }));
  const categoryRail = findElements(shell, (element) => element.type === ShowroomCategoryRail)[0];
  const quoteCard = findElements(shell, (element) => element.type === ShowroomQuoteCard)[0];

  assert.deepEqual(Object.keys(categoryRail.props).sort(), [
    'categories', 'onCategoryChange', 'selectedCategory',
  ]);
  assert.deepEqual(categoryRail.props.categories, viewModel.categories);
  assert.deepEqual(Object.keys(quoteCard.props).sort(), [
    'customerActions', 'estimate', 'materials',
  ]);
  assert.deepEqual(quoteCard.props.materials, viewModel.materials);
  assert.deepEqual(quoteCard.props.estimate, viewModel.estimate);
  assert.deepEqual(quoteCard.props.customerActions, viewModel.customerActions);
});

test('authenticated presentation exposes exactly one discreet restoring action', () => {
  const calls = [];
  const shell = ShowroomModeShell(baseProps({
    sessionType: 'authenticated-presentation',
    onExitPresentation: () => calls.push('restore'),
  }));
  const exits = findElements(shell, (element) => (
    element.type === 'button' && element.props.children === 'Exit Presentation'
  ));

  assert.equal(exits.length, 1);
  exits[0].props.onClick();
  assert.deepEqual(calls, ['restore']);

  const html = renderToStaticMarkup(shell);
  assert.equal((html.match(/Exit Presentation/g) || []).length, 1);
  assert.match(html, /class="showroom-exit-presentation"/);
});

test('authenticated presentation exposes category-compatible product, profile, and color mutations', () => {
  const calls = [];
  const shell = ShowroomModeShell(baseProps({
    sessionType: 'authenticated-presentation',
    presentationEditable: true,
    onExitPresentation: () => {},
    materials: materials.map((material) => ({
      ...material,
      onSelect: () => calls.push(`color:${material.id}`),
    })),
    presentationControls: {
      selectedCategory: 'roof',
      selectedProductId: 'roof-product',
      selectedProfile: 'Standing seam',
      selectedColorId: 'graphite',
      productOptions: [
        { id: 'roof-product', label: 'Roof Product', category: 'roof', source: 'material', profiles: ['Standing seam'] },
        { id: 'wall-product', label: 'Wall Product', category: 'siding', source: 'material', profiles: ['Board and batten'] },
      ],
      profileOptions: ['Standing seam', 'Snap lock'],
      onProductChange: (id) => calls.push(`product:${id}`),
      onProfileChange: (profile) => calls.push(`profile:${profile}`),
      onRemoveProduct: (id) => calls.push(`remove:${id}`),
      onRemoveProfile: () => calls.push('remove-profile'),
      onRemoveColor: () => calls.push('remove-color'),
    },
  }));
  const quoteCard = findElements(shell, (element) => element.type === ShowroomQuoteCard)[0];
  const editors = findElements(ShowroomQuoteCard(quoteCard.props), (element) => (
    element.type === PresentationCatalogEditor
  ));

  assert.equal(editors.length, 1);
  assert.deepEqual(editors[0].props.controls.productOptions.map((option) => option.id), ['roof-product']);
  assert.equal(Object.hasOwn(editors[0].props.controls.productOptions[0], 'unitPrice'), false);

  const editor = PresentationCatalogEditor(editors[0].props);
  const productSelect = findElements(editor, (element) => (
    element.type === 'select' && element.props['aria-label'] === 'Product'
  ))[0];
  const profileSelect = findElements(editor, (element) => (
    element.type === 'select' && element.props['aria-label'] === 'Profile'
  ))[0];
  const removeProduct = findElements(editor, (element) => (
    element.type === 'button' && element.props.children === 'Remove Product'
  ))[0];
  const removeProfile = findElements(editor, (element) => (
    element.type === 'button' && element.props.children === 'Remove Profile'
  ))[0];
  const removeColor = findElements(editor, (element) => (
    element.type === 'button' && element.props.children === 'Remove Color'
  ))[0];
  const addProduct = findElements(editor, (element) => (
    element.type === 'button' && element.props.children === 'Add Product'
  ));

  assert.equal(addProduct.length, 0, 'product selection is the one add/select mutation');
  productSelect.props.onChange({ target: { value: 'roof-product' } });
  profileSelect.props.onChange({ target: { value: 'Snap lock' } });
  removeProduct.props.onClick();
  removeProfile.props.onClick();
  removeColor.props.onClick();
  assert.deepEqual(calls, [
    'product:roof-product', 'profile:Snap lock', 'remove:roof-product', 'remove-profile', 'remove-color',
  ]);
});

test('public Showroom strips catalog picker options and every design mutation callback', () => {
  const shell = ShowroomModeShell(baseProps({
    sessionType: 'public',
    presentationEditable: true,
    materials: materials.map((material) => ({ ...material, onSelect: () => {} })),
    presentationControls: {
      selectedCategory: 'roof',
      productOptions: [{ id: 'private-product', label: 'Private Product', category: 'roof', unitPrice: 99 }],
      onAddProduct: () => {},
      onRemoveProduct: () => {},
      onProductChange: () => {},
      onProfileChange: () => {},
      onRemoveColor: () => {},
    },
  }));

  assert.equal(findElements(shell, (element) => element.type === PresentationCatalogEditor).length, 0);
  const quoteCard = findElements(shell, (element) => element.type === ShowroomQuoteCard)[0];
  const swatches = findElements(ShowroomQuoteCard(quoteCard.props), (element) => (
    element.type === 'button' && element.props.className?.includes('showroom-material-swatch')
  ));
  assert.ok(swatches.every((button) => button.props.disabled === true));
  assert.ok(swatches.every((button) => button.props.onClick === undefined));
  assert.doesNotMatch(renderToStaticMarkup(shell), /Private Product|99/);
});

test('session type is closed to invalid or missing values', () => {
  assert.throws(() => ShowroomModeShell(baseProps({ sessionType: 'expert' })), /invalid Showroom session type/i);
  assert.throws(() => ShowroomModeShell(baseProps({ sessionType: undefined })), /invalid Showroom session type/i);
});

test('category rail exposes controlled customer-safe choices', () => {
  const changes = [];
  const rail = ShowroomCategoryRail({
    categories,
    selectedCategory: 'roof',
    onCategoryChange: (key) => changes.push(key),
  });
  const buttons = findElements(rail, (element) => element.type === 'button');

  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].props['aria-pressed'], true);
  assert.equal(buttons[1].props['aria-pressed'], false);
  buttons[1].props.onClick();
  assert.deepEqual(changes, ['siding']);
  assert.equal(buttons[2].props.disabled, true);
  assert.equal(buttons[2].props.onClick, undefined);

  const html = renderToStaticMarkup(rail);
  assert.match(html, /aria-label="Material categories"/);
  assert.match(html, /Not rendered by this model/);
  assert.doesNotMatch(html, /internalUnitPrice|\$8.90|database row 77/i);
});

test('authenticated presentation can select an unavailable geometry category and keeps its explanation visible', () => {
  const changes = [];
  const rail = ShowroomCategoryRail({
    categories,
    selectedCategory: 'roof',
    onCategoryChange: (key) => changes.push(key),
    allowUnavailableSelection: true,
  });
  const buttons = findElements(rail, (element) => element.type === 'button');

  assert.equal(buttons[2].props.disabled, false);
  buttons[2].props.onClick();
  assert.deepEqual(changes, ['accents']);
  assert.match(renderToStaticMarkup(rail), /Not rendered by this model/);
});

test('unsupported category and material choices are visibly unavailable', () => {
  const rail = ShowroomCategoryRail({ categories, selectedCategory: 'roof' });
  const categoryButtons = findElements(rail, (element) => element.type === 'button');
  assert.ok(categoryButtons.every((button) => button.props.disabled === true));

  const invalidRail = ShowroomCategoryRail({
    categories,
    selectedCategory: 'roof',
    onCategoryChange: 'not a callback',
  });
  const invalidCategoryButtons = findElements(invalidRail, (element) => element.type === 'button');
  assert.ok(invalidCategoryButtons.every((button) => button.props.disabled === true));
  assert.ok(invalidCategoryButtons.every((button) => button.props.onClick === undefined));

  const materialViewModel = buildShowroomViewModel({
    materials: [materials[0], { ...materials[1], onSelect: 'not a callback' }],
  });
  const quoteCard = ShowroomQuoteCard({
    materials: materialViewModel.materials,
    estimate: materialViewModel.estimate,
    customerActions: materialViewModel.customerActions,
  });
  const swatches = findElements(quoteCard, (element) => (
    element.type === 'button' && element.props.className?.includes('showroom-material-swatch')
  ));
  assert.ok(swatches.every((button) => button.props.disabled === true));
  assert.ok(swatches.every((button) => button.props.onClick === undefined));
});

test('material swatches are selected explicitly and never render internal fields', () => {
  const selected = [];
  const html = renderToStaticMarkup(createElement(ShowroomModeShell, baseProps({
    sessionType: 'authenticated-presentation',
    presentationEditable: true,
    materials: materials.map((material) => ({
      ...material,
      onSelect: () => selected.push(material.id),
    })),
  })));
  const materialViewModel = buildShowroomViewModel({
    presentationEditable: true,
    materials: materials.map((material) => ({
      ...material,
      onSelect: () => selected.push(material.id),
    })),
  });
  const quoteCard = ShowroomQuoteCard({
    materials: materialViewModel.materials,
    estimate: materialViewModel.estimate,
    customerActions: materialViewModel.customerActions,
  });
  const swatches = findElements(quoteCard, (element) => (
    element.type === 'button' && element.props.className?.includes('showroom-material-swatch')
  ));

  assert.equal(swatches.length, 2);
  assert.equal(swatches[0].props['aria-pressed'], true);
  swatches[1].props.onClick();
  assert.deepEqual(selected, ['driftwood']);
  assert.match(html, /Graphite/);
  assert.match(html, /Warm architectural finish/);
  assert.doesNotMatch(html, /\$8.90|tenant pricing settings|Locked/i);
});

test('Showroom materials honor the selected product palette without exposing incompatible colors', () => {
  const selections = [];
  const colors = [
    { id: 'roof-safe', name: 'Roof-safe', hex: '#111111', thumbnail: '/roof-safe.jpg' },
    { id: 'siding-safe', name: 'Siding-safe', hex: '#222222', thumbnail: '/siding-safe.jpg' },
    { id: 'incompatible', name: 'Incompatible', hex: '#333333', thumbnail: '/incompatible.jpg' },
  ];
  const roofMaterials = buildShowroomMaterials({
    colors,
    allowedColorIds: ['roof-safe'],
    selectedColorId: 'roof-safe',
    onSelect: (id) => selections.push(id),
  });
  const sidingMaterials = buildShowroomMaterials({
    colors,
    allowedColorIds: ['siding-safe'],
    selectedColorId: 'siding-safe',
    onSelect: (id) => selections.push(id),
  });

  assert.deepEqual(roofMaterials.map((material) => material.id), ['roof-safe']);
  assert.deepEqual(sidingMaterials.map((material) => material.id), ['siding-safe']);
  assert.equal(roofMaterials.find((material) => material.id === 'incompatible'), undefined);
  assert.deepEqual(selections, [], 'an absent incompatible color has no callback to mutate the design');
  roofMaterials[0].onSelect();
  assert.deepEqual(selections, ['roof-safe']);

  const unrestricted = buildShowroomMaterials({ colors, allowedColorIds: [], onSelect: () => {} });
  assert.deepEqual(unrestricted.map((material) => material.id), ['roof-safe', 'siding-safe', 'incompatible']);
});

test('duplicate catalog enrichment preserves rich compatibility and only fills missing snapshot metadata', () => {
  assert.equal(typeof mergePresentationCatalogOptions, 'function');
  const merged = mergePresentationCatalogOptions([
    {
      id: 'roof-a', label: 'Rich material', category: 'roof', source: 'material',
      profiles: ['Standing Seam', 'Snap Lock'], colorIds: ['color-a', 'color-b'], unitPrice: 14,
    },
    {
      id: 'roof-a', label: 'Library enrichment', category: 'roof', source: 'library',
      profiles: ['Standing Seam'], colorIds: ['color-a'], trimKind: null, unitPrice: 15,
    },
    {
      id: 'roof-a', label: 'Saved selection', category: 'roof', source: 'snapshot', snapshot: true,
      profiles: ['Standing Seam'], colorIds: [], unitPrice: 12.5,
    },
  ]);

  assert.deepEqual(merged, [{
    id: 'roof-a', label: 'Rich material', category: 'roof', source: 'material',
    kind: undefined, profileLabel: undefined,
    profiles: ['Standing Seam', 'Snap Lock'], colorIds: ['color-a', 'color-b'],
    trimKind: undefined, unit: undefined, unitPrice: 12.5, active: true,
  }]);
});

test('selecting then removing a trim color preserves the compatible palette across rerenders', () => {
  assert.equal(typeof presentationCatalogOptionFromTrimRecord, 'function');
  const record = createTrimAccent({
    id: 'gutters', kind: 'gutters', productId: 'library-gutter', productLabel: 'Library Gutter',
    profile: 'K-Style', profileOptions: ['K-Style'], colorId: 'color-a',
    compatibleColorIds: ['color-a', 'color-b'], quantity: 20, canonicalUnit: 'linear_feet',
    selected: true, unitPrice: 9,
  });
  const colors = [
    { id: 'color-a', name: 'A', hex: '#111111' },
    { id: 'color-b', name: 'B', hex: '#222222' },
    { id: 'color-x', name: 'Incompatible', hex: '#333333' },
  ];
  const selectedOption = presentationCatalogOptionFromTrimRecord(record);
  const selectedPalette = buildShowroomMaterials({
    colors, allowedColorIds: selectedOption.colorIds, selectedColorId: record.colorId,
  });
  const colorRemoved = createTrimAccent({ ...record, colorId: '' });
  const rerenderedOption = presentationCatalogOptionFromTrimRecord(colorRemoved);
  const rerenderedPalette = buildShowroomMaterials({
    colors, allowedColorIds: rerenderedOption.colorIds, selectedColorId: colorRemoved.colorId,
  });

  assert.deepEqual(selectedPalette.map((color) => color.id), ['color-a', 'color-b']);
  assert.deepEqual(rerenderedPalette.map((color) => color.id), ['color-a', 'color-b']);
  assert.deepEqual(rerenderedOption.colorIds, ['color-a', 'color-b']);
});

test('explicit trim kinds route products consistently without label inference', () => {
  assert.equal(typeof presentationCategoryForOption, 'function');
  const materialKinds = new Map([['wall-panel', 'wall']]);

  assert.equal(presentationCategoryForOption({ id: 'wall-panel' }, materialKinds), 'siding');
  assert.equal(presentationCategoryForOption({ id: 'g-1', trimKind: 'gutters' }, materialKinds), 'gutters');
  assert.equal(presentationCategoryForOption({ id: 'd-1', trimKind: 'downspouts' }, materialKinds), 'gutters');
  assert.equal(presentationCategoryForOption({ id: 'door-1', trimKind: 'garage_doors' }, materialKinds), 'doors');
  assert.equal(presentationCategoryForOption({ id: 'accent-1', trimKind: 'fascia' }, materialKinds), 'accents');
  assert.equal(presentationCategoryForOption({ id: 'mystery', label: 'Gutter by misleading label' }, materialKinds), null);
});

test('comparison, fullscreen, share, and contact controls appear only when supported', () => {
  const calls = [];
  const shell = ShowroomModeShell(baseProps({
    customerActions: {
      onShowBefore: () => calls.push('before'),
      onShowAfter: () => calls.push('after'),
      onToggleFullscreen: () => calls.push('fullscreen'),
      onShare: () => calls.push('share'),
      onContact: () => calls.push('contact'),
    },
  }));
  const quoteCard = findElements(shell, (element) => element.type === ShowroomQuoteCard)[0];
  const actions = [
    ...findElements(shell, (element) => (
      typeof element.type === 'function' && element.props.label
    )),
    ...findElements(ShowroomQuoteCard(quoteCard.props), (element) => (
      typeof element.type === 'function' && element.props.label
    )),
  ];

  for (const [label, expected] of [
    ['Before', 'before'],
    ['After', 'after'],
    ['Full screen', 'fullscreen'],
    ['Share', 'share'],
    ['Contact us', 'contact'],
  ]) {
    const action = actions.find((candidate) => candidate.props.label === label);
    assert.ok(action, `${label} should render when supported`);
    action.props.onClick();
    assert.equal(calls.at(-1), expected);
  }

  const unsupported = renderToStaticMarkup(createElement(ShowroomModeShell, baseProps()));
  assert.doesNotMatch(unsupported, />Before<|>After<|>Full screen<|>Share<|>Contact us</);
});

test('customer categories cover roof, siding, accents, doors, and gutters', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const [key, label] of [
    ['roof', 'Roof'], ['siding', 'Siding'], ['accents', 'Accents'], ['doors', 'Doors'], ['gutters', 'Gutters'],
  ]) {
    assert.match(app, new RegExp(`key: '${key}', label: '${label}'`));
  }
});

test('Showroom resolves exactly one supported persistent primary action', () => {
  const calls = [];
  const scenarios = [
    [{ onApprove: () => calls.push('approve'), onShare: () => calls.push('share') }, 'Approve This Design', 'approve'],
    [{ onRequestQuote: () => calls.push('quote') }, 'Request a Quote', 'quote'],
    [{ onContact: () => calls.push('contact') }, 'Contact us', 'contact'],
    [{ onShare: () => calls.push('share') }, 'Share Design', 'share'],
  ];

  for (const [customerActions, label, expected] of scenarios) {
    const card = ShowroomQuoteCard({ materials: [], estimate: {}, customerActions });
    const primaries = findElements(card, (element) => (
      typeof element.type === 'function' && element.props.className === 'showroom-primary-action'
    ));
    assert.equal(primaries.length, 1);
    assert.equal(primaries[0].props.label, label);
    primaries[0].props.onClick();
    assert.equal(calls.at(-1), expected);
  }
});

test('the selected Share or Contact primary action is not duplicated as a secondary action', () => {
  for (const [customerActions, label] of [
    [{ onShare: () => {} }, 'Share Design'],
    [{ onContact: () => {} }, 'Contact us'],
  ]) {
    const html = renderToStaticMarkup(ShowroomQuoteCard({ materials: [], estimate: {}, customerActions }));
    assert.equal((html.match(new RegExp(label, 'g')) || []).length, 1);
    if (label === 'Share Design') assert.doesNotMatch(html, />Share</);
  }
});

test('an unsaved standalone design visibly disables Share and explains why', () => {
  const reason = 'This standalone design was not saved to Projects and cannot be shared from this file.';
  const viewModel = buildShowroomViewModel({
    customerActions: { shareUnavailableReason: reason },
  });
  const card = ShowroomQuoteCard({
    materials: [], estimate: {}, customerActions: viewModel.customerActions,
  });
  const disabledShare = findElements(card, (element) => (
    element.type === 'button' && element.props.children === 'Share Design'
  ));
  const html = renderToStaticMarkup(card);

  assert.equal(disabledShare.length, 1);
  assert.equal(disabledShare[0].props.disabled, true);
  assert.equal(disabledShare[0].props.onClick, undefined);
  assert.match(html, /not saved to Projects and cannot be shared/);
});

test('invalid public links render a safe error state instead of sample design controls', () => {
  const html = renderToStaticMarkup(createElement(ShowroomModeShell, baseProps({
    status: 'error',
    errorMessage: 'This shared design link is invalid.',
    customerActions: { onShare: () => {} },
  })));

  assert.match(html, /role="alert"/);
  assert.match(html, /This shared design link is invalid\./);
  assert.doesNotMatch(html, /Interactive home|Graphite|Driftwood|\$24,850/);
});

test('Option C keeps the viewer dominant with compact category and quote regions', async () => {
  const css = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../src/styles/workspace-modes.css', import.meta.url),
    'utf8',
  ));
  const shellRule = css.match(/\.workspace-root\.showroom-workspace\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(shellRule, 'Showroom workspace should have a root layout rule');
  assert.match(shellRule, /display:\s*grid/);
  assert.match(shellRule, /"header header header"/);
  assert.match(shellRule, /"categories viewer quote"/);
  assert.match(shellRule, /minmax\(0, 1fr\)/);
  assert.match(css, /\.workspace-root \.showroom-category-region\s*\{[^}]*grid-area:\s*categories/s);
  assert.match(css, /\.workspace-root \.showroom-viewer-region\s*\{[^}]*grid-area:\s*viewer/s);
  assert.match(css, /\.workspace-root \.showroom-quote-region\s*\{[^}]*grid-area:\s*quote/s);
});

test('App mounts only the allowlisted Showroom path for customer views', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const workspaceSelector = app.split('export function AppWorkspace')[1]?.split('export default function App')[0];

  assert.match(app, /import ShowroomModeShell, \{[^}]*buildShowroomViewModel[^}]*\} from '\.\/components\/workspaces\/ShowroomModeShell\.jsx';/);
  assert.match(app, /const showroomViewModel = useMemo\(\(\) => \{[\s\S]*?buildShowroomViewModel\(\{[\s\S]*?categories:[\s\S]*?materials:[\s\S]*?estimate:[\s\S]*?customerActions:/);
  assert.match(app, /const selectedProductId = showroomSelectedCategory === 'roof'[\s\S]*?showroomSelectedCategory === 'siding'[\s\S]*?selectedTrimRecord/);
  assert.match(app, /const applicableColorIds = selectedProductOption\?\.colorIds\?\.length[\s\S]*?effectiveMaterialsCatalog\.find\(\(material\) => material\.id === selectedProductId\)\?\.colorIds;/);
  assert.match(app, /const showroomColors = categoryCanChooseFinish[\s\S]*?applicableColorIds\?\.length[\s\S]*?allColors\(\)\.filter\(\(color\) => applicableColorIds\.includes\(color\.id\)\)/);
  assert.match(app, /materials: buildShowroomMaterials\(\{[\s\S]*?colors: showroomColors,[\s\S]*?allowedColorIds: applicableColorIds,/);
  assert.ok(workspaceSelector, 'App should expose one closed workspace selector');
  assert.match(workspaceSelector, /if \(workspaceState\.mode === 'showroom'\) \{[\s\S]*?shell = <ShowroomModeShell[^>]*\{\.\.\.showroomViewModel\}[^>]*viewerStage=\{null\} \/>;/);
  assert.match(workspaceSelector, /key="persistent-viewer"[\s\S]*?\{viewerStage\}/);
  assert.doesNotMatch(workspaceSelector, /fullControlsContent|PriceSummary|ProjectsPanel|PlatformConsole|SettingsPanel|internalUnitPrice/);
  assert.match(app, /const showroomShellViewModel = \{[\s\S]*?categories: showroomViewModel\.categories,[\s\S]*?materials: showroomViewModel\.materials,[\s\S]*?estimate: showroomViewModel\.estimate,[\s\S]*?customerActions: showroomViewModel\.customerActions,/);
  assert.doesNotMatch(app, /import StudioShell|<StudioShell/);
});

test('App derives authenticated presentation editing and reuses Sales design setters', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(app, /derivePresentationEditable\(\{[\s\S]*?currentUser,[\s\S]*?isCustomerView,[\s\S]*?session: workspaceState,/);
  assert.match(app, /presentationEditable:\s*!isCustomerView/);
  assert.doesNotMatch(app, /onAddProduct/);
  assert.match(app, /onRemoveProduct/);
  assert.match(app, /handleRoofProductChange/);
  assert.match(app, /handleWallProductChange/);
  assert.match(app, /handleTrimAccentsChange/);
  assert.match(app, /productBaseLabel\(selectedTrimRecord\.productLabel, selectedTrimRecord\.profile\)/);
  assert.doesNotMatch(app, /\/gutter\|eavestrough\|downspout\//);
  assert.match(app, /option\.trimKind/);
});

test('App gives only authenticated presentations an Exit callback and restores through verified transitions', async () => {
  const [app, controller, topBar] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useWorkspaceController.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workspaces/WorkspaceTopBar.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /import useWorkspaceController from '\.\/hooks\/useWorkspaceController\.js';/);
  assert.match(controller, /enterPresentation[^;]*exitPresentation[^;]*resolveWorkspaceMode/s);
  assert.match(controller, /resolveExpertEntitlement/);
  assert.match(controller, /const \[presentationWorkspace, setPresentationWorkspace\] = useState\(null\);/);
  assert.match(controller, /const workspaceState = presentationWorkspace \|\| resolvedWorkspaceState;/);
  assert.match(controller, /setPresentationWorkspace\(enterPresentation\(\{[\s\S]*?\.\.\.workspaceState,[\s\S]*?activeStudioStep,[\s\S]*?activeExpertTool,/);
  assert.match(controller, /const restoredWorkspace = exitPresentation\(presentationWorkspace, workspaceSecurityContext\);[\s\S]*?setExpertRequested\(restoredWorkspace\.mode === 'expert'\);[\s\S]*?setActiveStudioStep\(restoredWorkspace\.activeStudioStep\);[\s\S]*?setActiveExpertTool\(restoredWorkspace\.activeExpertTool\);/);
  assert.match(app, /sessionType: authenticatedPresentation \? 'authenticated-presentation' : 'public'/);
  assert.match(app, /onExitPresentation: authenticatedPresentation \? handleExitPresentation : undefined/);
  assert.match(app, /onPresent=\{workspaceState\.mode === 'sales' && configuratorActive \? handlePresentToCustomer : undefined\}/);
  assert.match(app, /onPresent: handlePresentToCustomer/);
  assert.match(topBar, /onPresent,/);
  assert.match(topBar, /onPresent &&/);
  assert.match(topBar, /<button disabled=\{projectBusy\} onClick=\{onPresent\} type="button">Present to Customer<\/button>/);
});

test('SuperAdmin presentation restores Expert when the tenant preference remains enabled', () => {
  const expertEntitled = resolveExpertEntitlement({
    role: 'superadmin',
    tenantEntitlement: false,
  });
  const presentation = enterPresentation({
    mode: 'expert',
    authenticated: true,
    expertEntitled,
    showExpertMode: true,
  });

  const restored = exitPresentation(presentation, {
    authenticated: true,
    expertEntitled,
    showExpertMode: true,
  });

  assert.equal(expertEntitled, true);
  assert.equal(restored.mode, 'expert');

  const preferenceRevoked = exitPresentation(enterPresentation({
    mode: 'expert',
    authenticated: true,
    expertEntitled,
    showExpertMode: true,
  }), {
    authenticated: true,
    expertEntitled,
    showExpertMode: false,
  });
  assert.equal(preferenceRevoked.mode, 'sales');
});
