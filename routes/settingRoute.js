import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js'
import settingController from '../controllers/settingController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.get('/effective',
    settingController.getEffectiveSettings
)




export default router;
