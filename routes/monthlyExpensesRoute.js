import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import monthlyExpensesController from '../controllers/monthlyExpensesController.js';
import validateIdParam from '../validates/idValidate.js';
import monthlyExpensesValidate from '../validates/monthlyExpensesValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);
router.use(permissionMiddleware('manage_expenses'))

router.post('/', monthlyExpensesValidate.create, monthlyExpensesController.create)
router.get('/', monthlyExpensesController.getAll)
router.get('/available_months', monthlyExpensesController.getAvailableMonths)
router.get('/available_types', monthlyExpensesController.getAvailableTypes)
router.get('/:expensesId', validateIdParam('expensesId'), monthlyExpensesController.getById)
router.put('/:expensesId', validateIdParam('expensesId'), monthlyExpensesValidate.update, monthlyExpensesController.update)
router.delete('/:expensesId', validateIdParam('expensesId'), monthlyExpensesController.delete)

export default router