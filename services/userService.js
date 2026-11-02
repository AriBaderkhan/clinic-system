import bcrypt from 'bcrypt';
import userModel from '../models/userModel.js';
import userBranchRoleModel from '../models/userBranchRoleModel.js';
import profileModel from '../models/profileModel.js';
import docModel from '../models/docModel.js';
import withTransaction from '../utils/withTransaction.js';
import appError from '../utils/appError.js';
import subscriptionService from './subscriptionService.js';
import subscriptionModel from '../models/subscriptionModel.js';

// a built-in role, or a custom role of THIS clinic (never another clinic's role)
const roleOfClinic = async (role_id, tenant_id, client) => {
    const role = await userModel.checkRoleIfDoc(role_id, client);
    if (!role || (role.tenant_id && Number(role.tenant_id) !== Number(tenant_id))) {
        throw appError('ROLE_NOT_FOUND', 'Role not found', 404);
    }
    return role;
}


async function create(userData, tenant_id) {

    const { branch_id, full_name, email, password, role_id, phone, address, room, is_active } = userData;
    const role = await roleOfClinic(role_id, tenant_id); // checked BEFORE anything is created
    if (role.is_doctor && is_active !== false) await subscriptionService.assertDoctorSeat(tenant_id);
    const hashedPassword = await bcrypt.hash(String(password || ''), 10);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await userModel.createUser(normalizedEmail, hashedPassword, tenant_id, is_active);
    const user_id = user.id;

    await userBranchRoleModel.createRowUBR(user_id, branch_id, tenant_id, role_id);

    // roles that treat patients get a doctor record (shows in the doctor lists)
    if (role.is_doctor) {
        await docModel.addDoc(user_id, room, tenant_id, branch_id);
    }
    await profileModel.addProfile(user_id, full_name, phone, address);
    return { id: user_id, email: normalizedEmail, role_id, full_name };
}

async function getAll(tenant_id) {
    const users = await userModel.getAllUsers(tenant_id);
    return users;
}

async function getById(user_id, tenant_id) {
    const user = await userModel.getUserById(user_id, tenant_id);
    return user;
}


async function update(user_id, tenant_id, userData) {
    if (userData.password) {
        const hashedPassword = await bcrypt.hash(String(userData.password || ''), 10);
        userData.password = hashedPassword;
    }
    // switching a doctor back on takes a doctor seat again
    if (userData.is_active === true && await subscriptionModel.hasDoctorRole(user_id, tenant_id)) {
        await subscriptionService.assertDoctorSeat(tenant_id, user_id);
    }
    const user = await userModel.updateUser(user_id, tenant_id, userData);
    return user;
}


// give the user a role in a branch; a doctor role also gets his doctor record there
// (one doctor can work in several branches)
async function assignToBranch(user_id, tenant_id, userData) {
    const { branch_id, role_id } = userData
    return withTransaction(async (client) => {
        const role = await roleOfClinic(role_id, tenant_id, client);
        if (role.is_doctor) await subscriptionService.assertDoctorSeat(tenant_id, user_id);
        const result = await userModel.assigendToTheBranch(user_id, tenant_id, branch_id, role_id, client);
        if (role.is_doctor) await docModel.addDoc(user_id, 1, tenant_id, branch_id, client);
        return result;
    });
}


async function getRoles(tenant_id) {
    const roles = await userModel.getRoles(tenant_id);
    return roles;
}
export default { create, getAll, getById, update, getRoles, assignToBranch }