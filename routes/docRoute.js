import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import docController from '../controllers/docController.js';
import validateIdParam from '../validates/idValidate.js';

router.use(authMiddleware);
router.get('/', roleCheck('reception'), docController.controllerGetAllDocs)
router.get("/appointments/per-doctor", roleCheck('doctor','super_doctor'), docController.controllerListApptsPerDoctor);


router.get("/active/appointments/today", roleCheck('doctor','super_doctor'), docController.controllerActiveTodayAppt);

router.get('/:appointmentId/session', roleCheck('doctor','super_doctor'), validateIdParam('appointmentId'), docController.controllerGetSessionByApptIdPerDoc);


export default router;