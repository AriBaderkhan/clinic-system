import specialtyModel from '../models/specialtyModel.js';
import appError from '../utils/appError.js';

const getAll = async (tenant_id, branch_id) => {
    return specialtyModel.getAll(tenant_id, branch_id);
}

const create = async ({ name, uses_teeth }, tenant_id, branch_id) => {
    const existing = await specialtyModel.getByName(name, tenant_id, branch_id);
    if (existing) throw appError('SPECIALTY_ALREADY_EXISTS', 'A specialty with this name already exists', 409);
    return specialtyModel.create(name, uses_teeth, tenant_id, branch_id);
}

const update = async (id, { name, uses_teeth }, tenant_id, branch_id) => {
    const existing = await specialtyModel.getByName(name, tenant_id, branch_id);
    if (existing && Number(existing.id) !== Number(id)) throw appError('SPECIALTY_ALREADY_EXISTS', 'A specialty with this name already exists', 409);
    const specialty = await specialtyModel.update(id, name, uses_teeth, tenant_id, branch_id);
    if (!specialty) throw appError('SPECIALTY_NOT_FOUND', 'Specialty not found', 404);
    return specialty;
}

// a specialty still used by a doctor or an active treatment cannot be removed
const _delete = async (id, tenant_id, branch_id) => {
    const used = await specialtyModel.usageCounts(id, tenant_id, branch_id);
    if (Number(used.doctors) > 0 || Number(used.works) > 0) {
        throw appError('SPECIALTY_IN_USE', 'Move its doctors and treatments to another specialty first', 409);
    }
    const removed = await specialtyModel.deactivate(id, tenant_id, branch_id);
    if (!removed) throw appError('SPECIALTY_NOT_FOUND', 'Specialty not found', 404);
    return removed;
}

export default { getAll, create, update, delete: _delete }
