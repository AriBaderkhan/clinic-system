import express from 'express';
const router = express.Router();

import authController from '../controllers/authController.js';
import authValidate from '../validates/authValidate.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import  roleCheck  from '../middlewares/roleMiddleware.js';

router.post('/register',authMiddleware,roleCheck('reception'),authValidate.validateRegistration,authController.controllerRegistration)
router.post('/login',authValidate.validateLogin,authController.controllerLogin)



export default router;