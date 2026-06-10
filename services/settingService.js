import settingModel from '../models/settingModel.js'

async function getEffective(tenant_id, branch_id) {
    const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id)
    return settings
}

export default { getEffective }