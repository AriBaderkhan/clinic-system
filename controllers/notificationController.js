import asyncWrap from '../utils/asyncWrap.js';
import notificationService from '../services/notificationService.js';

// My recent notifications (the logged-in user's own bell).
const getMine = asyncWrap(async (req, res) => {
    const { id, tenant_id, branch_id } = req.user;
    const result = await notificationService.listMine(id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
});

// Mark one of my notifications as read.
const markRead = asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const { id: userId, tenant_id, branch_id } = req.user;
    await notificationService.markRead(id, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
});

export default { getMine, markRead };
