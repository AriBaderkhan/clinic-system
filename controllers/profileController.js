import profileService from '../services/profileService.js';
import asyncWrap from '../utils/asyncWrap.js';

// Everything here acts on req.user.id only — a user can never touch another's profile.

const getMe = asyncWrap(async (req, res) => {
    const result = await profileService.getMe(req.user);
    res.status(200).json({ ok: true, data: result });
});

// Multipart: text fields on req.body, optional avatar on req.files (first one).
const updateMe = asyncWrap(async (req, res) => {
    const file = req.files?.[0] || null;
    const result = await profileService.updateMe(req.user, req.body, file);
    res.status(200).json({ ok: true, data: result });
});

const changePassword = asyncWrap(async (req, res) => {
    const result = await profileService.changePassword(req.user, req.body.currentPassword, req.body.newPassword);
    res.status(200).json({ ok: true, data: result });
});

const sendEmailCode = asyncWrap(async (req, res) => {
    const result = await profileService.sendEmailChangeCode(req.user, req.body.email);
    res.status(200).json({ ok: true, data: result });
});

const changeEmail = asyncWrap(async (req, res) => {
    const result = await profileService.changeEmail(req.user, req.body.email, req.body.code);
    res.status(200).json({ ok: true, data: result });
});

export default { getMe, updateMe, changePassword, sendEmailCode, changeEmail };
