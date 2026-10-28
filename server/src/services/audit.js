import { AuditEvent } from '../models/index.js';

export async function audit(req, action, { entityType, entityId, summary, meta } = {}) {
  try {
    await AuditEvent.create({
      orgId: req.auth.orgId,
      actorId: req.auth.userId,
      actorName: req.auth.user?.name,
      actorRole: req.auth.role,
      action, entityType, entityId: entityId ? String(entityId) : undefined, summary, meta,
      ip: (req.ip || '').slice(0, 60),
    });
  } catch (e) { console.error('[audit] failed', e.message); }
}
