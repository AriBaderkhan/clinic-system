import settingService from "../services/settingService.js"
import asyncWrap from '../utils/asyncWrap.js'

const getEffectiveSettings = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await settingService.getEffectiveSettings(tenant_id, branch_id);
    return res.status(200).json({ success: true, data: result });
})

export default {
    getEffectiveSettings
}