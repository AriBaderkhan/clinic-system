import adminPlatformService from "../services/adminPlatformService.js";
import asyncWrap from '../utils/asyncWrap.js';

const register = asyncWrap(async (req, res) => {
    const result = await adminPlatformService.register(req.body);
    res.status(201).json({ ok: true, data: result });
});

const getAll = asyncWrap(async (req, res) => {
    const result = await adminPlatformService.getAll();
    res.status(200).json({ ok: true, data: result });
});

export default { register, getAll };