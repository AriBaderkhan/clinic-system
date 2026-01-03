import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import monthlyExpensesController from '../controllers/monthlyExpensesController.js';
import validateIdParam from '../validates/idValidate.js';
import monthlyExpensesValidate from '../validates/monthlyExpensesValidate.js';


router.use(authMiddleware);


router.post('/',roleCheck('reception', 'super_doctor'),monthlyExpensesValidate.validateCreateMonthlyExpenses,monthlyExpensesController.controllerCreateMonthlyExpneses)
router.get('/',roleCheck('reception', 'super_doctor'),monthlyExpensesController.controllerGetAllMonthlyExpneses)
router.get('/:expensesId',roleCheck('reception', 'super_doctor'),validateIdParam('expensesId'),monthlyExpensesController.controllerGetMonthlyExpneses)
router.put('/:expensesId',roleCheck('reception', 'super_doctor'),validateIdParam('expensesId'),monthlyExpensesValidate.validateUpdateMonthlyExpenses,monthlyExpensesController.controllerUpdateMonthlyExpneses)
router.delete('/:expensesId', roleCheck('reception', 'super_doctor'), validateIdParam('expensesId'), monthlyExpensesController.controllerDeleteMonthlyExpneses)



export default router

