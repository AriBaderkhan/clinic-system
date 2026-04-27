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

router.post('/', monthlyExpensesValidate.createExpenses, monthlyExpensesController.controllerCreateMonthlyExpneses)
router.get('/', monthlyExpensesController.controllerGetAllMonthlyExpneses)
router.get('/:expensesId', validateIdParam('expensesId'), monthlyExpensesController.controllerGetMonthlyExpneses)
router.put('/:expensesId', validateIdParam('expensesId'), monthlyExpensesValidate.updateExpenses, monthlyExpensesController.controllerUpdateMonthlyExpneses)
router.delete('/:expensesId', validateIdParam('expensesId'), monthlyExpensesController.controllerDeleteMonthlyExpneses)

router.get('/available_months', monthlyExpensesController.getAvailableMonths)

router.get('/available_types', monthlyExpensesController.getAvailableTypes)


export default router
