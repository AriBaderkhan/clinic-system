import registrationService from '../services/registrationService.js';
import asyncWrap from '../utils/asyncWrap.js';

// ── Public ──
const sendCode = asyncWrap(async (req, res) => {
    const result = await registrationService.sendCode(req.body.email);
    res.status(200).json({ ok: true, data: result });
});

const verifyCode = asyncWrap(async (req, res) => {
    const result = await registrationService.verifyCode(req.body.email, req.body.code);
    res.status(200).json({ ok: true, data: result });
});

// Multipart: text fields on req.body, evidence image on req.files (first one).
const create = asyncWrap(async (req, res) => {
    const file = req.files?.[0] || null;
    const result = await registrationService.createRequest(req.body, file);
    res.status(201).json({ ok: true, data: result });
});

// ── Platform admin ──
const listPending = asyncWrap(async (req, res) => {
    const result = await registrationService.listPending();
    res.status(200).json({ ok: true, data: result });
});

const approve = asyncWrap(async (req, res) => {
    const result = await registrationService.approve(Number(req.params.id), req.user.id);
    res.status(200).json({ ok: true, data: result });
});

const reject = asyncWrap(async (req, res) => {
    const result = await registrationService.reject(Number(req.params.id), req.user.id, req.body?.note);
    res.status(200).json({ ok: true, data: result });
});

export default { sendCode, verifyCode, create, listPending, approve, reject };
