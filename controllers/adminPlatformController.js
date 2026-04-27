import adminPlatformService from "../services/adminPlatformService.js";
import asyncWrap from '../utils/asyncWrap.js';

const registerTenant = asyncWrap(async (req, res) => {
    const result = await adminPlatformService.registerTenant(req.body);
    res.status(201).json(result);
});

const getAllTenants = asyncWrap(async (req, res) => {
    const tenants = await adminPlatformService.getAllTenants();
    res.status(200).json(tenants);
});

export default {
    registerTenant,
    getAllTenants
};
