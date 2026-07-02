import docService from '../services/docService.js';
import asyncWrap from '../utils/asyncWrap.js';
import { buildDoctorReportPdfBuffer } from '../src/pdf/doctorReportPdf.js';

const getAll = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await docService.getAll(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getActiveToday = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getActiveToday(doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getOpenAppts = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getOpenAppts(doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAppointments = asyncWrap(async (req, res) => {
    const { day, type, q } = req.query;
    const doc_id = req.user.id
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getAppointments({
        day, type, search: q, doc_id
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: result });
})

const getSession = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const doc_id = req.user.id
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getSession(appointmentId, doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

// The logged-in doctor's own report (on-screen JSON).
const getMyReport = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;
    const { tenant_id, branch_id } = req.user;
    const { month, from, to } = req.query;

    const result = await docService.getMyReport({ month, from, to }, doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
});

// Same report as a downloadable PDF (mirrors the general branch report).
const downloadMyReportPdf = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;
    const { tenant_id, branch_id } = req.user;
    const { month, from, to } = req.query;

    const reportData = await docService.getMyReport({ month, from, to }, doc_id, tenant_id, branch_id);
    const pdfBuffer = await buildDoctorReportPdfBuffer(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="doctor-report.pdf"');
    res.status(200).send(pdfBuffer);
});

export default { getAll, getActiveToday, getOpenAppts, getAppointments, getSession, getMyReport, downloadMyReportPdf }