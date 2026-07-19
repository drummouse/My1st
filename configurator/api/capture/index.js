import { sql, ensureSchema } from '../_lib/db.js';
import { requireCapability } from '../_lib/access.js';
import { CaptureValidationError } from '../_lib/capturePolicy.js';
import { createCaptureService, createNeonCaptureStore } from '../_lib/captureService.js';

// IronWrap Capture API — one consolidated Vercel function (Hobby-plan
// function cap; see api/projects/index.js for the pattern). Paths are mapped
// to query params by vercel.json rewrites:
//   /api/capture/sessions       -> ?action=sessions        list/create
//   /api/capture/sessions/<id>  -> ?action=session&id=<id> read/update/archive
// Every action requires the capture.create capability server-side before any
// dispatch; ownership is enforced per-row inside captureService.js.
function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  res.status(405).json({ error: 'Method not allowed' });
}

const ERROR_STATUS = {
  CAPTURE_SESSION_NOT_FOUND: 404,
  CAPTURE_ASSET_NOT_FOUND: 404,
  CAPTURE_TRANSITION_INVALID: 409,
  CAPTURE_SESSION_LOCKED: 409,
  CAPTURE_NOT_AUTHORIZED: 403,
};

export default async function handler(req, res) {
  const action = String(req.query.action || 'sessions');
  try {
    await ensureSchema();
    const actor = await requireCapability(req, res, 'capture.create');
    if (!actor) return;
    const service = createCaptureService({ store: createNeonCaptureStore(sql) });

    if (action === 'sessions') {
      if (req.method === 'GET') {
        return res.status(200).json({ sessions: await service.listSessions(actor, req.query) });
      }
      if (req.method === 'POST') {
        const { session, created } = await service.createSession(actor, req.body || {});
        return res.status(created ? 201 : 200).json({ session, created });
      }
      return methodNotAllowed(res, 'GET, POST');
    }

    if (action === 'session') {
      const id = String(req.query.id || '');
      if (req.method === 'GET') {
        return res.status(200).json(await service.getSession(actor, id));
      }
      if (req.method === 'PATCH') {
        // The only transition PATCH may drive is archive. Submission has a
        // dedicated endpoint because it validates completeness and freezes
        // the review snapshot — allowing it here would bypass both.
        if (req.body?.status) {
          if (String(req.body.status) !== 'archived') {
            return res.status(409).json({
              error: { code: 'CAPTURE_TRANSITION_INVALID', message: 'Use the dedicated endpoint for this transition' },
            });
          }
          const { session } = await service.archiveSession(actor, id, req.body?.reason);
          return res.status(200).json({ session });
        }
        const { session } = await service.updateDraft(actor, id, req.body || {});
        return res.status(200).json({ session });
      }
      return methodNotAllowed(res, 'GET, PATCH');
    }

    // /api/capture/sessions/<id>/validate — server-truth completeness.
    if (action === 'validate') {
      if (req.method === 'GET') {
        return res.status(200).json(await service.validateSession(actor, String(req.query.id || '')));
      }
      return methodNotAllowed(res, 'GET');
    }

    // /api/capture/sessions/<id>/submit — validated submit/resubmit that
    // freezes the immutable review snapshot.
    if (action === 'submit') {
      if (req.method === 'POST') {
        const { session, completeness } = await service.submitSession(actor, String(req.query.id || ''));
        return res.status(200).json({ session, completeness });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/assets — finalize a direct Blob upload as
    // an asset row (the bytes never pass through this function).
    if (action === 'assets') {
      const id = String(req.query.id || '');
      if (req.method === 'POST') {
        const { asset } = await service.addAsset(actor, id, req.body || {});
        return res.status(201).json({ asset });
      }
      return methodNotAllowed(res, 'POST');
    }

    // /api/capture/sessions/<id>/assets/<assetId> — delete before submit.
    if (action === 'asset') {
      if (req.method === 'DELETE') {
        await service.removeAsset(actor, String(req.query.id || ''), String(req.query.assetId || ''));
        return res.status(204).end();
      }
      return methodNotAllowed(res, 'DELETE');
    }

    res.status(404).json({ error: 'Unknown Capture action' });
  } catch (error) {
    if (error instanceof CaptureValidationError) {
      return res.status(ERROR_STATUS[error.code] || 400).json({
        error: { code: error.code, message: error.message, details: error.details || {} },
      });
    }
    console.error('Capture request failed:', error);
    res.status(500).json({ error: 'Capture operation failed' });
  }
}
