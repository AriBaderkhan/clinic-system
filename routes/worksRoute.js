import express from 'express';
const router = express.Router();


import authMiddleware from "../middlewares/authMiddleware.js";
import branchAssigmentMiddleware from "../middlewares/branchAssigmentMiddleware.js";
import worksController from "../controllers/worksController.js";
import idValidate from "../validates/idValidate.js";
import worksValidate from "../validates/worksValidate.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.post(
    '/',
    permissionMiddleware('manage_works'),
    worksValidate.createWork,
    worksController.createWork);

router.get(
    '/',
    permissionMiddleware('view_works'),
    worksController.getWorks);

router.get(
    '/:workId',
    permissionMiddleware('view_works'),
    idValidate('workId'),
    worksController.getWorkById);

router.put(
    '/:workId',
    permissionMiddleware('manage_works'),
    idValidate('workId'),
    worksValidate.updateWork,
    worksController.updateWork);

router.delete(
    '/:workId',
    permissionMiddleware('manage_works'),
    idValidate('workId'),
    worksController.deleteWork);


export default router;