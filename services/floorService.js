import floorModel from '../models/floorModel.js';
import appError from '../utils/appError.js';
import withTransaction from '../utils/withTransaction.js';

// the branch floors + the floor of the person asking (for the default filter)
const getAll = async (user_id, tenant_id, branch_id) => {
    const [floors, my_floor_id] = await Promise.all([
        floorModel.getAll(tenant_id, branch_id),
        floorModel.getStaffFloorId(user_id, tenant_id, branch_id),
    ]);
    return { floors, my_floor_id };
}

const create = async ({ name, sort_order }, tenant_id, branch_id) => {
    const existing = await floorModel.getByName(name, tenant_id, branch_id);
    if (existing) throw appError('FLOOR_ALREADY_EXISTS', 'A floor with this name already exists', 409);
    return floorModel.create(name, sort_order, tenant_id, branch_id);
}

const update = async (id, { name, sort_order }, tenant_id, branch_id) => {
    const existing = await floorModel.getByName(name, tenant_id, branch_id);
    if (existing && Number(existing.id) !== Number(id)) throw appError('FLOOR_ALREADY_EXISTS', 'A floor with this name already exists', 409);
    const floor = await floorModel.update(id, name, sort_order, tenant_id, branch_id);
    if (!floor) throw appError('FLOOR_NOT_FOUND', 'Floor not found', 404);
    return floor;
}

// a floor that is still someone's home floor cannot be removed
const _delete = async (id, tenant_id, branch_id) => {
    return withTransaction(async (client) => {
        const staff = await floorModel.countStaff(id, tenant_id, branch_id, client);
        if (staff > 0) throw appError('FLOOR_IN_USE', 'Move its staff to another floor first', 409);
        const removed = await floorModel.deactivate(id, tenant_id, branch_id, client);
        if (!removed) throw appError('FLOOR_NOT_FOUND', 'Floor not found', 404);
        return removed;
    });
}

const getStaff = async (tenant_id, branch_id) => {
    return floorModel.getStaff(tenant_id, branch_id);
}

// set (or clear with null) one person's home floor in this branch
const setStaffFloor = async (user_id, floor_id, tenant_id, branch_id) => {
    return withTransaction(async (client) => {
        const isStaff = await floorModel.isBranchStaff(user_id, tenant_id, branch_id, client);
        if (!isStaff) throw appError('STAFF_NOT_FOUND', 'This person does not work in this branch', 404);

        if (floor_id == null) {
            await floorModel.clearStaffFloor(user_id, tenant_id, branch_id, client);
        } else {
            const floor = await floorModel.getById(floor_id, tenant_id, branch_id, client);
            if (!floor) throw appError('FLOOR_NOT_FOUND', 'Floor not found', 404);
            await floorModel.setStaffFloor(user_id, floor_id, tenant_id, branch_id, client);
        }
        return { user_id: Number(user_id), floor_id: floor_id ?? null };
    });
}

export default { getAll, create, update, delete: _delete, getStaff, setStaffFloor }
