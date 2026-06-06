import userService from '../services/userService.js'
import asyncWrap from '../utils/asyncWrap.js'

const createUser = async (req, res) => {
    const tenant_id = req.user.tenant_id;

    try {

        const result = await userService.createUser(req.body, tenant_id);
        
        res.status(201).json({ message: 'User created successfully', data: result })
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'An error occurred while creating the user' });
    }
}
const getAllUsers = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const result = await userService.getAllUsers(tenant_id);
    res.status(200).json({ message: 'Users fetched successfully', data: result })
})
const getUserById = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.getUserById(user_id, tenant_id);
    res.status(200).json({ message: 'User fetched successfully', data: result })
})

const updateUser = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.updateUser(user_id, tenant_id, req.body);
    res.status(200).json({ message: 'User updated successfully', data: result })
})



const assigendToTheBranch = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.assigendToTheBranch(user_id, tenant_id, req.body);
    res.status(200).json({ message: 'User assigned to the branch successfully', data: result })
})


//--------------dropdown-----
const getRoles = asyncWrap(async (req, res) => {
    const result = await userService.getRoles();
    res.status(200).json({ message: 'Roles fetched successfully', data: result })
})
const deactivateUser = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    await userService.updateUser(user_id, tenant_id, { is_active: false });
    res.status(200).json({ message: 'User deactivated successfully' });
})

export default { createUser, getAllUsers, getUserById, updateUser, getRoles, assigendToTheBranch, deactivateUser }



