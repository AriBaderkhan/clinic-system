import appointmentService from '../services/appointmentService.js';
import asyncWrap from '../utils/asyncWrap.js';
import { io } from '../main.js';

const create = asyncWrap(async (req, res) => {
    const { patient_id, doctor_id, scheduled_start, appointment_type } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user

    const appointmentData = { patient_id, doctor_id, scheduled_start, created_by, appointment_type }

    const result = await appointmentService.create(appointmentData, tenant_id, branch_id)
    res.status(201).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.getById(appointmentId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const { patient_id, doctor_id, scheduled_start } = req.body;
    const appointmentId = Number(req.params.appointmentId);
    const updatedBy = req.user.id;
    const { tenant_id, branch_id } = req.user

    const appointmentDataForUpdate = { appointmentId, patient_id, doctor_id, scheduled_start, updatedBy }

    const result = await appointmentService.update(appointmentDataForUpdate, tenant_id, branch_id)
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const { tenant_id, branch_id } = req.user

    await appointmentService.delete(appointmentId, tenant_id, branch_id)
    res.status(200).json({ ok: true });
})

const checkIn = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.checkIn(appointmentId, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const start = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.start(appointmentId, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const complete = asyncWrap(async (req, res) => {
    const { next_plan, notes, works, completedPlanIds } = req.body;
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.complete({ appointmentId, doctorId: userId, next_plan, notes, works, completedPlanIds }, tenant_id, branch_id);

    io.to('reception_room').emit('appointment_completed', {
        message: ` Dr. ${result.details.doctor_name} has completed appointment for patient ${result.details.patient_name}`
    });

    res.status(200).json({ ok: true, data: result });
})

const cancel = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const { cancel_reason } = req.body;
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.cancel(appointmentId, userId, cancel_reason, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const noShow = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const { cancel_reason } = req.body;
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.noShow(appointmentId, userId, cancel_reason, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const { day, type, q, page, limit } = req.query;
    const { tenant_id, branch_id } = req.user;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);

    const { rows, total } = await appointmentService.getAll({
        day, type, search: q, page: safePage, limit: safeLimit,
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const getCalendar = asyncWrap(async (req, res) => {
    const { from, to } = req.query;
    const { tenant_id, branch_id, role } = req.user;

    // doctors only see their own appointments on the calendar
    const doctor_id = role === 'doctor' ? req.user.id : null;

    const result = await appointmentService.getCalendar({ from, to, doctor_id }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getActiveToday = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.getActiveToday(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getSession = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const { tenant_id, branch_id } = req.user

    const result = await appointmentService.getSession(appointmentId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default {
    create, getById, update, delete: _delete,
    checkIn, start, complete, cancel, noShow,
    getAll, getCalendar, getActiveToday, getSession
};