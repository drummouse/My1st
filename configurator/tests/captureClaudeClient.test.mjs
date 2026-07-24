import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isClaudeGuidanceEnabled,
  claudeGuidanceUnavailableReason,
  claudeModelConfigured,
  requestClaudeGuidance,
} from '../api/_lib/captureClaudeClient.js';

// A deliberately unremarkable placeholder model id — this test suite never
// asserts a specific "correct" model name; it only asserts that WHATEVER
// value CAPTURE_CLAUDE_MODEL holds is passed through exactly, unmodified,
// with no hardcoded fallback anywhere in the client.
const TEST_MODEL = 'test-configured-model-id';
const ENABLED_ENV = { CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key', CAPTURE_CLAUDE_MODEL: TEST_MODEL };
const ENABLED_ENV_NO_MODEL = { CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key' };
const baseRequest = () => ({ calibration: { units: 'mm', knownFeature: 'width' }, measurementCount: 1, acceptedAssets: [] });

function okThumbnailBytes() {
  return { ok: true, arrayBuffer: async () => new TextEncoder().encode('fake-jpeg-bytes').buffer };
}

function mockFetch({ toolInput, apiStatus = 200, thumbnailOk = true, apiBody } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (!options) {
      // Thumbnail fetch — a plain GET.
      return thumbnailOk ? okThumbnailBytes() : { ok: false };
    }
    // Main Anthropic API call.
    return {
      ok: apiStatus >= 200 && apiStatus < 300,
      status: apiStatus,
      json: async () => apiBody ?? {
        model: 'claude-sonnet-5',
        content: toolInput === undefined ? [] : [{ type: 'tool_use', input: toolInput }],
      },
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('isClaudeGuidanceEnabled / claudeGuidanceUnavailableReason require both the flag and a key', () => {
  assert.equal(isClaudeGuidanceEnabled({}), false);
  assert.equal(claudeGuidanceUnavailableReason({}), 'disabled');

  assert.equal(isClaudeGuidanceEnabled({ CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true' }), false);
  assert.equal(claudeGuidanceUnavailableReason({ CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true' }), 'unavailable');

  assert.equal(isClaudeGuidanceEnabled({ ANTHROPIC_API_KEY: 'x' }), false, 'the flag must be exactly "true", not just present');
  assert.equal(isClaudeGuidanceEnabled({ CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'false', ANTHROPIC_API_KEY: 'x' }), false);

  assert.equal(isClaudeGuidanceEnabled(ENABLED_ENV), true);
  assert.equal(claudeGuidanceUnavailableReason(ENABLED_ENV), null);
});

test('claudeModelConfigured requires a non-empty string, no default, no inference', () => {
  assert.equal(claudeModelConfigured({}), false);
  assert.equal(claudeModelConfigured({ CAPTURE_CLAUDE_MODEL: '' }), false);
  assert.equal(claudeModelConfigured({ CAPTURE_CLAUDE_MODEL: '   ' }), false);
  assert.equal(claudeModelConfigured({ CAPTURE_CLAUDE_MODEL: 123 }), false, 'non-string values are rejected, not coerced');
  assert.equal(claudeModelConfigured({ CAPTURE_CLAUDE_MODEL: TEST_MODEL }), true);
});

// Required test 1: guidance disabled with no model configured — the model
// gate must never even be reached; the reason stays exactly 'disabled'.
test('1. disabled with no model configured: reason is "disabled", not a model-related error, no network call', async () => {
  const fetchImpl = mockFetch();
  const result = await requestClaudeGuidance(baseRequest(), { env: {}, fetchImpl });
  assert.deepEqual(result, { ok: false, reason: 'disabled' });
  assert.equal(fetchImpl.calls.length, 0, 'disabled must never touch the network');
});

test('unavailable (flag on, no key): no network call is made', async () => {
  const fetchImpl = mockFetch();
  const result = await requestClaudeGuidance(baseRequest(), {
    env: { CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true' }, fetchImpl,
  });
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  assert.equal(fetchImpl.calls.length, 0);
});

// Required test 2 + 5: guidance enabled but CAPTURE_CLAUDE_MODEL missing —
// a controlled 'configuration_error', never a request, never a hardcoded
// substitute model.
test('2/5. enabled with no model configured: reason is "configuration_error", no network call, no hardcoded fallback', async () => {
  const fetchImpl = mockFetch();
  const result = await requestClaudeGuidance(baseRequest(), { env: ENABLED_ENV_NO_MODEL, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'configuration_error');
  assert.equal(fetchImpl.calls.length, 0, 'a missing model must never reach the network — not even the thumbnail fetch');
});

// Required test 3: guidance enabled with a valid configured model succeeds
// normally, end to end.
test('3. enabled with a valid configured model: the call proceeds and succeeds normally', async () => {
  const fetchImpl = mockFetch({ toolInput: { confidence: 0.5, shotRequest: null } });
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.raw, { confidence: 0.5, shotRequest: null });
});

// Required test 4: the configured model string is passed EXACTLY to the
// Anthropic request body — never altered, never defaulted.
test('4. the configured model is passed exactly, verbatim, in the API request body', async () => {
  const fetchImpl = mockFetch({ toolInput: { confidence: 0.5 } });
  await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  const apiCall = fetchImpl.calls.find((c) => c.options && c.options.method === 'POST');
  const sentBody = JSON.parse(apiCall.options.body);
  assert.equal(sentBody.model, TEST_MODEL);

  // A different configured value is passed exactly as-is too — proving
  // there's no hardcoded model string anywhere in the client.
  const otherFetch = mockFetch({ toolInput: { confidence: 0.5 } });
  await requestClaudeGuidance(baseRequest(), {
    env: { ...ENABLED_ENV, CAPTURE_CLAUDE_MODEL: 'a-completely-different-model-id' },
    fetchImpl: otherFetch,
    assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  const otherApiCall = otherFetch.calls.find((c) => c.options && c.options.method === 'POST');
  assert.equal(JSON.parse(otherApiCall.options.body).model, 'a-completely-different-model-id');
});

test('a successful call returns the raw tool input and image count, using only thumbnails', async () => {
  const toolInput = { confidence: 0.6, shotRequest: null };
  const fetchImpl = mockFetch({ toolInput });
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV,
    fetchImpl,
    assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.raw, toolInput);
  assert.equal(result.imageCount, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://thumb.example/a1.jpg');
  assert.equal(fetchImpl.calls[0].options, undefined, 'the thumbnail fetch is a plain GET');
  assert.ok(fetchImpl.calls[1].options.headers['x-api-key']);
  assert.equal(fetchImpl.calls[1].options.headers['x-api-key'], 'test-key');
});

test('no images available (all thumbnail fetches fail): the main API call is never made', async () => {
  const fetchImpl = mockFetch({ thumbnailOk: false });
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.deepEqual(result, { ok: false, reason: 'no_images_available' });
  assert.equal(fetchImpl.calls.length, 1, 'only the failed thumbnail fetch, never the API call');
});

test('a non-2xx API response is reported as reason "error"', async () => {
  const fetchImpl = mockFetch({ apiStatus: 500 });
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
});

test('a response with no tool_use block is reported as reason "invalid"', async () => {
  const fetchImpl = mockFetch({ apiBody: { content: [{ type: 'text', text: 'no tool call' }] } });
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
});

test('a network throw is reported as reason "error", and never propagates (the function never throws)', async () => {
  const fetchImpl = async (url, options) => {
    if (!options) return okThumbnailBytes();
    throw new Error('network unreachable');
  };
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.match(result.error, /network unreachable/);
});

test('a timeout (AbortError) is reported as reason "timeout"', async () => {
  const fetchImpl = async (url, options) => {
    if (!options) return okThumbnailBytes();
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  };
  const result = await requestClaudeGuidance(baseRequest(), {
    env: ENABLED_ENV, fetchImpl, assetThumbnails: [{ assetId: 'a1', url: 'https://thumb.example/a1.jpg' }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
});

test('at most 6 images are fetched per request, even if more accepted assets exist', async () => {
  const fetchImpl = mockFetch({ toolInput: { confidence: 0.5 } });
  const assetThumbnails = Array.from({ length: 10 }, (_, i) => ({ assetId: `a${i}`, url: `https://thumb.example/a${i}.jpg` }));
  const result = await requestClaudeGuidance(baseRequest(), { env: ENABLED_ENV, fetchImpl, assetThumbnails });
  assert.equal(result.ok, true);
  assert.equal(result.imageCount, 6);
  // 6 thumbnail fetches + 1 API call.
  assert.equal(fetchImpl.calls.length, 7);
});
