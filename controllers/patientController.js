import patientService from '../services/patientService.js';
import asyncWrap from '../utils/asyncWrap.js';

const create = asyncWrap(async (req, res) => {
    const { name, phone, age, gender, address, allergies, blood_type, chronic_diseases } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const patientData = { name, phone, age, gender, address, allergies, blood_type, chronic_diseases, created_by }

    const result = await patientService.create(patientData, tenant_id, branch_id);
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const { q, page, limit } = req.query;
    const { tenant_id, branch_id } = req.user;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);
    const { rows, total } = await patientService.getAll({ q, page: safePage, limit: safeLimit }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const getById = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.getById(patientId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId);
    const updatedBy = req.user.id;
    const fields = req.body;
    const { tenant_id, branch_id } = req.user;

    const patientDataUpdate = { patientId, updatedBy, fields }

    const result = await patientService.update(patientDataUpdate, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    await patientService.delete(patientId, tenant_id, branch_id)
    res.status(200).json({ ok: true });
})

const search = asyncWrap(async (req, res) => {
    const q = (req.query.q || "").trim();
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.search(q, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAppointments = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.getAppointments(patientId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getSessions = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const limit = Math.min(50, parseInt(req.query.limit) || 0) || null;

    const result = await patientService.getSessions(patientId, tenant_id, branch_id, limit);
    res.status(200).json({ ok: true, data: result });
})

const getPayments = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.getPayments(patientId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getTreatmentPlans = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.getTreatmentPlans(patientId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default {
    create, getAll, getById, update, delete: _delete,
    search, getAppointments, getSessions, getPayments, getTreatmentPlans
}