import settingModel from '../models/settingModel.js'
import appError from '../utils/appError.js'

async function getEffective(tenant_id, branch_id) {
    const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id)
    return settings
}

async function getWorkflow(tenant_id, branch_id) {
    const workflow = await settingModel.getWorkflow(tenant_id, branch_id)
    if (!workflow) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404)
    return workflow
}

async function updateWorkflow(fields, userId, tenant_id, branch_id) {
    await getWorkflow(tenant_id, branch_id) // the branch must be this clinic's
    return settingModel.saveWorkflow(fields, userId, tenant_id, branch_id)
}

export default { getEffective, getWorkflow, updateWorkflow }
