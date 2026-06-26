import auditModel from '../models/auditModel.js';

const PAGE_SIZE = 20;

const VERB_BY_METHOD = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Derive a coarse action/entity straight from the request — no hand-kept route
// map to maintain. e.g. DELETE /api/patients/42 -> patients.delete, id 42.
function deriveAction(method, path) {
    const clean = (path || '').split('?')[0].replace(/^\/api\//, '');
    const parts = clean.split('/').filter(Boolean);
    const resource = parts[0] || 'unknown';
    const id = parts.find((p) => /^\d+$/.test(p));
    const verb = VERB_BY_METHOD[method] || (method || '').toLowerCase();
    return { action: `${resource}.${verb}`, entity_type: resource, entity_id: id ? Number(id) : null };
}

// Fire-and-forget: logging must never block or break the real request.
function record(ctx) {
    const { action, entity_type, entity_id } = deriveAction(ctx.method, ctx.path);
    auditModel.record({ ...ctx, action, entity_type, entity_id }).catch(() => {});
}

// Paginated, tenant-scoped read for the activity-log UI.
async function list(tenant_id, { q, from, to, page } = {}) {
    const current = Math.max(1, Number(page) || 1);
    const offset = (current - 1) * PAGE_SIZE;
    const { rows, total } = await auditModel.list({ tenant_id, q, from, to, limit: PAGE_SIZE, offset });
    return { rows, total, page: current, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export default { record, list };
