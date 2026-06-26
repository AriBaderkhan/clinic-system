import announcementService from '../services/announcementService.js';
import asyncWrap from '../utils/asyncWrap.js';

// ── Platform admin ──
// Multipart: text fields on req.body, optional image on req.files (first one).
const create = asyncWrap(async (req, res) => {
    const file = req.files?.[0] || null;
    const result = await announcementService.create(req.user, req.body, file);
    res.status(201).json({ ok: true, data: result });
});

const listAdmin = asyncWrap(async (req, res) => {
    const planId = req.query.plan_id ? Number(req.query.plan_id) : null;
    const result = await announcementService.listAdmin(planId);
    res.status(200).json({ ok: true, data: result });
});

const remove = asyncWrap(async (req, res) => {
    const result = await announcementService.remove(Number(req.params.id));
    res.status(200).json({ ok: true, data: result });
});

// ── tenant_manager / branch_manager ──
const listForMe = asyncWrap(async (req, res) => {
    const result = await announcementService.listForMe(req.user);
    res.status(200).json({ ok: true, data: result });
});

const markRead = asyncWrap(async (req, res) => {
    const result = await announcementService.markRead(Number(req.params.id), req.user);
    res.status(200).json({ ok: true, data: result });
});

export default { create, listAdmin, remove, listForMe, markRead };
