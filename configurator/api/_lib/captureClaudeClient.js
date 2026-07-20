import { CLAUDE_GUIDANCE_TOOL_SCHEMA } from './captureClaudePolicy.js';

// Server-side Claude vision integration (R2.4). Direct `fetch` against the
// Anthropic Messages API — no SDK dependency (decision log: a single call
// site doesn't justify @anthropic-ai/sdk). Two independent gates must both
// be true before any network call happens:
//   1. CAPTURE_CLAUDE_GUIDANCE_ENABLED === 'true' — evaluated server-side
//      only, never trusted from the client.
//   2. ANTHROPIC_API_KEY is set.
// What image data this sends and why is documented in
// docs/CAPTURE_R2_CLAUDE_PRIVACY_DECISION.md — read that before changing
// this file's request-building logic.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_MODEL_ID = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_IMAGES_PER_REQUEST = 6;

export function isClaudeGuidanceEnabled(env = process.env) {
  return env.CAPTURE_CLAUDE_GUIDANCE_ENABLED === 'true' && Boolean(env.ANTHROPIC_API_KEY);
}

// Reason recorded when the call is skipped entirely — never a secret, never
// a stack trace, just which of the two independent gates is closed.
export function claudeGuidanceUnavailableReason(env = process.env) {
  if (env.CAPTURE_CLAUDE_GUIDANCE_ENABLED !== 'true') return 'disabled';
  if (!env.ANTHROPIC_API_KEY) return 'unavailable';
  return null;
}

// Fetches an ALREADY-GENERATED derived thumbnail's bytes and base64-encodes
// them — no image processing happens here; the thumbnail is already the
// right size (privacy decision §3). Returns null (never throws) on any
// failure so the caller can drop just that one asset rather than failing
// the whole guidance call over one bad thumbnail fetch.
async function fetchThumbnailBase64(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch {
    return null;
  }
}

function buildMessageContent(request, thumbnails) {
  const imageBlocks = thumbnails.flatMap(({ assetId, mediaType, base64 }) => ([
    { type: 'text', text: `Photo for accepted shot "${assetId}":` },
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
  ]));
  const context = {
    calibration: request.calibration,
    measurementCount: request.measurementCount,
    acceptedAssets: request.acceptedAssets.map((a) => ({ assetId: a.assetId, purpose: a.purpose })),
  };
  return [
    ...imageBlocks,
    {
      type: 'text',
      text: [
        'You are the semantic-guidance layer for one IronWrap Capture profile-geometry scan.',
        'Identify visible or ambiguous physical features (bends, seams, ribs, hems, locks, laps, returns, edges, flanges, beads, connection details).',
        'You are never authoritative for scale, measurement, geometry, coordinates, permissions, or evidence completion — do not assert any of those.',
        'If one additional photo would genuinely help, recommend exactly one via the tool call; otherwise leave shotRequest null.',
        `Session context: ${JSON.stringify(context)}`,
      ].join(' '),
    },
  ];
}

// Makes the live call. Returns { ok: true, raw, model, imageCount } on a
// structured tool response, or { ok: false, reason, error? } on any
// failure/skip — this function NEVER throws, so a Claude outage can never
// block capture completion.
export async function requestClaudeGuidance(request, {
  assetThumbnails = [], env = process.env, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!isClaudeGuidanceEnabled(env)) {
    return { ok: false, reason: claudeGuidanceUnavailableReason(env) };
  }

  const thumbnails = [];
  for (const asset of assetThumbnails.slice(0, MAX_IMAGES_PER_REQUEST)) {
    // eslint-disable-next-line no-await-in-loop
    const base64 = await fetchThumbnailBase64(asset.url, fetchImpl);
    if (base64) thumbnails.push({ assetId: asset.assetId, mediaType: asset.mediaType || 'image/jpeg', base64 });
  }
  if (thumbnails.length === 0) {
    return { ok: false, reason: 'no_images_available' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL_ID,
        max_tokens: 1024,
        tools: [CLAUDE_GUIDANCE_TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: CLAUDE_GUIDANCE_TOOL_SCHEMA.name },
        messages: [{ role: 'user', content: buildMessageContent(request, thumbnails) }],
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: 'error', error: `Anthropic API returned ${response.status}` };
    }
    const body = await response.json();
    const toolUse = (body.content || []).find((block) => block.type === 'tool_use');
    if (!toolUse) {
      return { ok: false, reason: 'invalid', error: 'No structured tool response returned' };
    }
    return {
      ok: true, raw: toolUse.input, model: body.model || CLAUDE_MODEL_ID, imageCount: thumbnails.length,
    };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return { ok: false, reason: timedOut ? 'timeout' : 'error', error: error?.message || 'Claude request failed' };
  } finally {
    clearTimeout(timer);
  }
}

export { CLAUDE_MODEL_ID };
