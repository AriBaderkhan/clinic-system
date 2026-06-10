import settingService from "../services/settingService.js"
import asyncWrap from '../utils/asyncWrap.js'

const getEffective = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await settingService.getEffective(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default { getEffective }