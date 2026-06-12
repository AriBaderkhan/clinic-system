import labService from '../services/labService.js';
import asyncWrap from '../utils/asyncWrap.js';

// ===================== LABS =====================

const createLab = asyncWrap(async (req, res) => {
    const { name, phone, treatments } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.createLab({ name, phone, treatments }, tenant_id, branch_id);
    res.status(201).json({ ok: true, data: result });
})

const getLabs = asyncWrap(async (req, res) => {
    const { q, page, limit } = req.query;
    const { tenant_id, branch_id } = req.user;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);

    const { rows, total } = await labService.getLabs({
        search: q, page: safePage, limit: safeLimit,
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const searchLabs = asyncWrap(async (req, res) => {
    const { q } = req.query;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.searchLabs(q, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getLabById = asyncWrap(async (req, res) => {
    const labId = Number(req.params.labId);
    const { tenant_id, branch_id } = req.user;

    const result = await labService.getLabById(labId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const updateLab = asyncWrap(async (req, res) => {
    const labId = Number(req.params.labId);
    const { name, phone, treatments } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.updateLab(labId, { name, phone, treatments }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const deleteLab = asyncWrap(async (req, res) => {
    const labId = Number(req.params.labId);
    const { tenant_id, branch_id } = req.user;

    await labService.deleteLab(labId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
})

// ===================== ORDERS =====================

const createOrder = asyncWrap(async (req, res) => {
    const { lab_id, appointment_id, patient_id, doctor_id, work_id, quantity, notes } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.createOrder({
        lab_id, appointment_id, patient_id, doctor_id, work_id, quantity, notes, created_by,
    }, tenant_id, branch_id);

    res.status(201).json({ ok: true, data: result });
})

const getOrders = asyncWrap(async (req, res) => {
    const { status, lab_id, q, page, limit } = req.query;
    const { tenant_id, branch_id } = req.user;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);

    const { rows, total } = await labService.getOrders({
        status,
        lab_id: parseInt(lab_id) || null,
        search: q,
        page: safePage,
        limit: safeLimit,
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const getOrderById = asyncWrap(async (req, res) => {
    const orderId = Number(req.params.orderId);
    const { tenant_id, branch_id } = req.user;

    const result = await labService.getOrderById(orderId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const updateOrder = asyncWrap(async (req, res) => {
    const orderId = Number(req.params.orderId);
    const { patient_id, doctor_id, work_id, quantity, notes } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.updateOrder(orderId, { patient_id, doctor_id, work_id, quantity, notes }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const setOrderStatus = asyncWrap(async (req, res) => {
    const orderId = Number(req.params.orderId);
    const { status } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await labService.setOrderStatus(orderId, status, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const deleteOrder = asyncWrap(async (req, res) => {
    const orderId = Number(req.params.orderId);
    const { tenant_id, branch_id } = req.user;

    await labService.deleteOrder(orderId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
})

export default {
    createLab, getLabs, searchLabs, getLabById, updateLab, deleteLab,
    createOrder, getOrders, getOrderById, updateOrder, setOrderStatus, deleteOrder,
};
