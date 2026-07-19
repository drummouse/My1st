import { randomUUID as nodeRandomUUID } from 'node:crypto';
import {
  CaptureValidationError,
  EDITABLE_STATUSES,
  assertTransition,
  normalizeCreateInput,
  normalizeDraftPatch,
} from './capturePolicy.js';

export function toCaptureSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.ownerId ?? null,
    clientRef: row.client_ref ?? row.clientRef ?? null,
    captureType: row.capture_type ?? row.captureType,
    category: row.category ?? null,
    title: row.title ?? null,
    status: row.status,
    currentStep: row.current_step ?? row.currentStep ?? null,
    completeness: Number(row.completeness ?? 0),
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    publishedRecordId: row.published_record_id ?? row.publishedRecordId ?? null,
    publishedVersion: row.published_version ?? row.publishedVersion ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function toCaptureField(row) {
  return {
    fieldKey: row.field_key ?? row.fieldKey,
    value: row.value ?? null,
    source: row.source || 'manual',
    confidence: row.confidence == null ? null : Number(row.confidence),
    confirmedBy: row.confirmed_by ?? row.confirmedBy ?? null,
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

const rowOwner = (row) => row.owner_id ?? row.ownerId;

// Ownership is enforced here (the policy module checks capabilities only).
// A session outside the actor's tenant is reported as not-found, never as
// forbidden — same information-hiding stance as Library Core.
function assertVisible(actor, row) {
  if (!row) throw new CaptureValidationError('CAPTURE_SESSION_NOT_FOUND', 'Capture session not found');
  if (actor.role !== 'superadmin' && rowOwner(row) !== actor.id) {
    throw new CaptureValidationError('CAPTURE_SESSION_NOT_FOUND', 'Capture session not found');
  }
}

export function createCaptureService({ store, randomUUID = nodeRandomUUID }) {
  const audit = (actor, action, targetId, reason, metadata = {}) => ({
    actorId: actor.id, action, targetType: 'capture_session', targetId, reason: reason || null, metadata,
  });

  return {
    async listSessions(actor, filters = {}) {
      const rows = await store.listSessions({
        ownerId: actor.id,
        includeAllOwners: actor.role === 'superadmin',
        status: filters.status || null,
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map(toCaptureSession);
    },

    async getSession(actor, id) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const fields = await store.listFields(id);
      return { session: toCaptureSession(row), fields: fields.map(toCaptureField) };
    },

    // Idempotent by (owner, clientRef): retrying a create — flaky mobile
    // network, refresh mid-request — returns the already-created session
    // instead of a duplicate. A race between two identical creates is caught
    // by the partial unique index; the loser's retry lands here and finds
    // the winner.
    async createSession(actor, input) {
      const normalized = normalizeCreateInput(input);
      if (normalized.clientRef) {
        const existing = await store.getSessionByClientRef(actor.id, normalized.clientRef);
        if (existing) return { session: toCaptureSession(existing), created: false };
      }
      const change = {
        id: randomUUID(),
        ownerId: actor.id,
        status: 'draft',
        completeness: 0,
        ...normalized,
      };
      return store.transaction(async () => {
        const row = await store.createSession(change);
        await store.appendAudit(audit(actor, 'capture.session.created', change.id, null, {
          captureType: normalized.captureType, category: normalized.category,
        }));
        return { session: toCaptureSession(row), created: true };
      });
    },

    // Draft-content saves are deliberately NOT audited (decision D-012):
    // state changes, reviews, and archives are; keystroke-level saves would
    // only bury those. Content is only editable while the contributor still
    // owns the ball (draft / changes_requested).
    async updateDraft(actor, id, input) {
      const patch = normalizeDraftPatch(input);
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot be edited`, { status: row.status });
      }
      return store.transaction(async () => {
        const updated = await store.updateSessionContent(id, patch);
        for (const field of patch.fields || []) {
          await store.upsertField(id, field.fieldKey, field.value);
        }
        return { session: toCaptureSession(updated ?? { ...row, ...patch }) };
      });
    },

    async transitionSession(actor, id, toStatus, reason) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const outcome = assertTransition(actor.role, row.status, toStatus, reason);
      return store.transaction(async () => {
        const updated = await store.updateSessionStatus(id, row.status, toStatus);
        await store.appendAudit(audit(actor, outcome.audit, id, outcome.reason, outcome.metadata));
        return { session: toCaptureSession(updated ?? { ...row, status: toStatus }) };
      });
    },

    async archiveSession(actor, id, reason) {
      return this.transitionSession(actor, id, 'archived', reason);
    },
  };
}

// Neon store. Same queued-transaction idiom as libraryService.js's store:
// inside store.transaction(work), writes are queued and committed atomically
// via sql.transaction(); reads outside a transaction run immediately.
export function createNeonCaptureStore(sql) {
  let pendingQueries = null;
  const execute = async (query, optimisticValue) => {
    if (pendingQueries) {
      pendingQueries.push(query);
      return optimisticValue;
    }
    const rows = await query;
    return rows[0] ?? optimisticValue;
  };

  return {
    async transaction(work) {
      if (pendingQueries) throw new Error('Nested Capture transactions are not supported');
      pendingQueries = [];
      try {
        const value = await work();
        const queries = pendingQueries;
        pendingQueries = null;
        await sql.transaction(queries);
        return value;
      } catch (error) {
        pendingQueries = null;
        throw error;
      }
    },
    async listSessions({ ownerId, includeAllOwners, status, limit }) {
      return sql`select * from capture_sessions
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
          and (${status || null}::text is null or status = ${status || null})
          and status <> 'archived'
        order by updated_at desc limit ${limit}`;
    },
    async getSession(id) {
      const [row] = await sql`select * from capture_sessions where id = ${id}`;
      return row || null;
    },
    async getSessionByClientRef(ownerId, clientRef) {
      const [row] = await sql`select * from capture_sessions
        where owner_id = ${ownerId} and client_ref = ${clientRef}`;
      return row || null;
    },
    async createSession(change) {
      const query = sql`insert into capture_sessions
        (id, owner_id, client_ref, capture_type, category, title, status, current_step, completeness)
        values (${change.id}, ${change.ownerId}, ${change.clientRef}, ${change.captureType},
                ${change.category}, ${change.title}, ${change.status}, ${change.currentStep}, ${change.completeness})
        on conflict (owner_id, client_ref) where client_ref is not null do nothing
        returning *`;
      return execute(query, change);
    },
    async updateSessionContent(id, patch) {
      const query = sql`update capture_sessions set
          title = case when ${'title' in patch} then ${patch.title ?? null} else title end,
          category = case when ${'category' in patch} then ${patch.category ?? null} else category end,
          current_step = case when ${'currentStep' in patch} then ${patch.currentStep ?? null} else current_step end,
          updated_at = now()
        where id = ${id} returning *`;
      return execute(query, null);
    },
    // Guarded by the current status so a concurrent transition can't be
    // silently overwritten — the stale write updates zero rows.
    async updateSessionStatus(id, fromStatus, toStatus) {
      const query = sql`update capture_sessions set status = ${toStatus},
          submitted_at = case when ${toStatus === 'submitted'} then now() else submitted_at end,
          updated_at = now()
        where id = ${id} and status = ${fromStatus} returning *`;
      return execute(query, null);
    },
    async listFields(sessionId) {
      return sql`select * from capture_fields where session_id = ${sessionId} order by field_key`;
    },
    async upsertField(sessionId, fieldKey, value) {
      const query = sql`insert into capture_fields (session_id, field_key, value)
        values (${sessionId}, ${fieldKey}, ${JSON.stringify(value)}::jsonb)
        on conflict (session_id, field_key)
        do update set value = excluded.value, updated_at = now()`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
    async appendAudit(event) {
      const query = sql`insert into superadmin_audit_events (actor_id, action, target_type, target_id, reason, metadata)
        values (${event.actorId}, ${event.action}, ${event.targetType}, ${event.targetId},
                ${event.reason}, ${JSON.stringify(event.metadata || {})}::jsonb)`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
  };
}
