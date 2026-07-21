const baseUrl = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

if (!baseUrl) {
  console.error('SMOKE_BASE_URL is required. Example: SMOKE_BASE_URL=https://your-preview.vercel.app npm run smoke');
  process.exit(2);
}

const failures = [];
const requestHeaders = {
  'user-agent': 'ironwrap-smoke-test/1.0',
  ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
};

async function check(name, path, validate, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'follow',
      ...options,
      headers: {
        ...requestHeaders,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}

    const result = validate(response, body);
    if (result !== true) throw new Error(result || `unexpected response (${response.status})`);
    console.log(`PASS ${name} (${response.status}, ${Date.now() - started}ms)`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

await check('app shell', '/', (response, body) => {
  if (!response.ok) return `expected 2xx, received ${response.status}`;
  if (typeof body !== 'string' || !body.toLowerCase().includes('<!doctype html')) return 'expected HTML app shell';
  return true;
});

await check('database health', '/api/health', (response, body) => {
  if (response.status !== 200) return `expected 200, received ${response.status}`;
  if (!body || body.ok !== true) return 'health payload did not report ok=true';
  if (body.database !== 'reachable') return `database reported ${body.database}`;
  return true;
});

for (const path of ['/api/projects', '/api/settings', '/api/materials', '/api/colors', '/api/custom-services']) {
  await check(`auth guard ${path}`, path, (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  });
}

for (const path of ['/api/superadmin/summary', '/api/superadmin/tenants', '/api/superadmin/audit', '/api/superadmin/library']) {
  await check(`SuperAdmin auth guard ${path}`, path, (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  });
}
await check('auth guard /api/capture/sessions', '/api/capture/sessions', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check(
  'auth guard /api/capture/sessions create',
  '/api/capture/sessions',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
);
await check(
  'auth guard /api/capture asset finalize',
  '/api/capture/sessions/smoke-test/assets',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
);
await check(
  'auth guard /api/capture asset replace',
  '/api/capture/sessions/smoke-test/assets/smoke-test/replace',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
);
await check(
  'auth guard /api/capture asset blob',
  '/api/capture/sessions/smoke-test/assets/smoke-test/blob',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
);
await check(
  'auth guard /api/capture submit',
  '/api/capture/sessions/smoke-test/submit',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check('auth guard /api/capture/review', '/api/capture/review', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check('auth guard /api/capture evidence', '/api/capture/sessions/smoke-test/evidence', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check(
  'auth guard /api/capture claude-guidance',
  '/api/capture/sessions/smoke-test/claude-guidance',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check(
  'auth guard /api/capture material-zone',
  '/api/capture/sessions/smoke-test/material-zone',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check(
  'auth guard /api/capture texture-direction',
  '/api/capture/sessions/smoke-test/texture-direction',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check(
  'auth guard /api/capture studio-validation',
  '/api/capture/sessions/smoke-test/studio-validation',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check('auth guard /api/capture material-package dry-run', '/api/capture/sessions/smoke-test/material-package/dry-run', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check('auth guard /api/capture/tags', '/api/capture/tags', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check(
  'auth guard /api/capture/tags create',
  '/api/capture/tags',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check('auth guard /api/library/products', '/api/library/products', (response) => {
  if (response.status !== 401) return `expected 401, received ${response.status}`;
  return true;
});
await check(
  'auth guard /api/capture publish',
  '/api/capture/review/smoke-test/publish',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
);
await check(
  'auth guard /api/attachments write',
  '/api/attachments?projectId=smoke-test',
  (response) => {
    if (response.status !== 401) return `expected 401, received ${response.status}`;
    return true;
  },
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
);

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('\nAll IronWrap smoke checks passed.');
