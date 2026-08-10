import express from 'express';
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import branchAssigmentMiddleware from "../middlewares/branchAssigmentMiddleware.js";
import discountController from "../controllers/discountController.js";
import idValidate from "../validates/idValidate.js";
import discountValidate from "../validates/discountValidate.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// Listing is used by Settings (managers) AND the pay dropdown (payment collectors).
router.get('/', permissionMiddleware('manage_branch_settings', 'collect_payment'), discountController.getAll);

// Managing discounts is manager-only.
router.post('/', permissionMiddleware('manage_branch_settings'), discountValidate.create, discountController.create);
router.put('/:discountId', permissionMiddleware('manage_branch_settings'), idValidate('discountId'), discountValidate.update, discountController.update);
router.delete('/:discountId', permissionMiddleware('manage_branch_settings'), idValidate('discountId'), discountController.delete);

export default router;
