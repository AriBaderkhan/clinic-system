import bcrypt from 'bcrypt';
import userModel from '../models/userModel.js';
import userBranchRoleModel from '../models/userBranchRoleModel.js';
import profileModel from '../models/profileModel.js';
import docModel from '../models/docModel.js';


async function createUser(userData, tenant_id) {

    const { branch_id, full_name, email, password, role_id, phone, address, room, is_active } = userData;
    const hashedPassword = await bcrypt.hash(String(password || ''), 10);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await userModel.createUser(normalizedEmail, hashedPassword, tenant_id, is_active);
    const user_id = user.id;

    await userBranchRoleModel.createRowUBR(user_id, branch_id, tenant_id, role_id);

    const isDoc = await userModel.checkRoleIfDoc(role_id);
    if (isDoc.name === 'doctor') {
        await docModel.addDoc(user_id, room, tenant_id);
    }
    await profileModel.addProfile(user_id, full_name, phone, address);
    return { id: user_id, email: normalizedEmail, role_id, full_name };
}

async function getAllUsers(tenant_id) {
    const users = await userModel.getAllUsers(tenant_id);
    return users;
}

async function getUserById(user_id, tenant_id) {
    const user = await userModel.getUserById(user_id, tenant_id);
    return user;
}


async function updateUser(user_id, tenant_id, userData) {
    if (userData.password) {
        const hashedPassword = await bcrypt.hash(String(userData.password || ''), 10);
        userData.password = hashedPassword;
    }
    const user = await userModel.updateUser(user_id, tenant_id, userData);
    return user;
}


async function assigendToTheBranch(user_id, tenant_id, userData) {
    const { branch_id, role_id } = userData
    const result = await userModel.assigendToTheBranch(user_id, tenant_id, branch_id, role_id);
    return result;
}


async function getRoles() {
    const roles = await userModel.getRoles();
    return roles;
}
export default { createUser, getAllUsers, getUserById, updateUser, getRoles, assigendToTheBranch }