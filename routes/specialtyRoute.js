import express from 'express';
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import branchAssigmentMiddleware from "../middlewares/branchAssigmentMiddleware.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";
import idValidate from "../validates/idValidate.js";
import specialtyValidate from "../validates/specialtyValidate.js";
import specialtyController from "../controllers/specialtyController.js";

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// managing specialties = the same people who manage treatments (both managers)
router.get('/', permissionMiddleware('view_works'), specialtyController.getAll);
router.post('/', permissionMiddleware('manage_works'), specialtyValidate.save, specialtyController.create);
router.put('/:specialtyId', permissionMiddleware('manage_works'), idValidate('specialtyId'), specialtyValidate.save, specialtyController.update);
router.delete('/:specialtyId', permissionMiddleware('manage_works'), idValidate('specialtyId'), specialtyController.delete);

export default router;
