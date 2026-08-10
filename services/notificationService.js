import { io } from '../main.js';
import notificationModel from '../models/notificationModel.js';

// Best-effort delivery: save one row per recipient, then push each live over the
// socket to that user's own room. A failure here must NEVER break the caller —
// a missed bell can't be allowed to fail a check-in or a completion — so
// everything is wrapped and only logged.
async function notify({ recipientUserIds, type, message, appointmentId, tenant_id, branch_id }) {
    try {
        const ids = [...new Set((recipientUserIds || []).filter(Boolean).map(Number))];
        if (!ids.length) return;

        const rows = ids.map((user_id) => ({
            tenant_id, branch_id, user_id, type, message, appointment_id: appointmentId ?? null,
        }));

        const created = await notificationModel.createMany(rows);
        created.forEach((n) => io.to(`user_${n.user_id}`).emit('notification', n));
    } catch (err) {
        console.error('notify failed (non-fatal):', err.message);
    }
}

// Same as notify(), but the recipients are everyone holding one of the given
// roles in the branch (e.g. reception + branch/tenant managers at the desk).
async function notifyRoles({ roles, type, message, appointmentId, tenant_id, branch_id }) {
    try {
        const ids = await notificationModel.getUserIdsByRoles(roles, tenant_id, branch_id);
        await notify({ recipientUserIds: ids, type, message, appointmentId, tenant_id, branch_id });
    } catch (err) {
        console.error('notifyRoles failed (non-fatal):', err.message);
    }
}

async function listMine(user_id, tenant_id, branch_id) {
    return notificationModel.listForUser(user_id, tenant_id, branch_id);
}

async function markRead(id, user_id, tenant_id, branch_id) {
    return notificationModel.markRead(id, user_id, tenant_id, branch_id);
}

async function markAllRead(user_id, tenant_id, branch_id) { 
    return notificationModel.markAllRead(user_id, tenant_id, branch_id);
}

export default { notify, notifyRoles, listMine, markRead, markAllRead };