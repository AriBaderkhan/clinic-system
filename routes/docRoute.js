import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import docController from '../controllers/docController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get('/', permissionMiddleware('view_doctor'), docController.controllerGetAllDocs)
router.get("/appointments/per-doctor", permissionMiddleware('view_appointment'), docController.controllerListApptsPerDoctor);


router.get("/active/appointments/today", permissionMiddleware('view_appointment'), docController.controllerActiveTodayAppt);

router.get('/:appointmentId/session', permissionMiddleware('view_session'), validateIdParam('appointmentId'), docController.controllerGetSessionByApptIdPerDoc);


export default router;