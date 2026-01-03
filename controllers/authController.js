import authService from '../services/authService.js';
import jwt from 'jsonwebtoken';
import asyncWrap from '../utils/asyncWrap.js';

const controllerRegistration = asyncWrap(async (req, res) => {

    const user = await authService.serviceRegistration(req.body);
    res.status(201).json({
        message: 'User registered successfully',
        user
    })
})

const controllerLogin = asyncWrap(async (req, res) => {

    const user = await authService.serviceLogin(req.body);
    const payload = { id: user.id, role: user.role, name: user.name || user.full_name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
    res.status(200).json({
        message: 'Logged in Successfully',
        token,
        user: { id: user.id, role: user.role, name: user.name }
    })
})
export default { controllerRegistration, controllerLogin }