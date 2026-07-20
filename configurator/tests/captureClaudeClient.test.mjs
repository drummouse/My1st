import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isClaudeGuidanceEnabled,
  claudeGuidanceUnavailableReason,
  requestClaudeGuidance,
} from '../api/_lib/captureClaudeClient.js';

const ENABLED_ENV = { CAPTURE_CLAUDE_GUIDANCE_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key' };
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

test('disabled: no network call is made at all', async () => {
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
