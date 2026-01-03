import monthlyExpensesModel from '../models/monthlyExpensesModel.js'
import appError from '../utils/appError.js';


async function serviceCreateMonthlyExpneses(monthlyExpensesDetail) {

    const monthlyExpenses = await monthlyExpensesModel.createMonthlyExpneses(monthlyExpensesDetail);

    if (!monthlyExpenses) throw appError('INSERT_FAILED', 'Failed to create monthly expenses',404);
    return monthlyExpenses;
}

async function serviceGetAllMonthlyExpneses() {
    const expenses = await monthlyExpensesModel.getAllMonthlyExpneses();

    if (!expenses || expenses.length === 0) return [];
    return expenses;
}

async function serviceGetMonthlyExpneses(expensesId) {

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId);

    if (!expenses) throw appError('FETCH_MONTHLY_EXPENSES_FAILIED', 'No monthly expenses found',404);
    return expenses;
}

async function serviceUpdateMonthlyExpneses(monthlyExpensesDataUpdate) {
    const { expensesId, fields, updated_by } = monthlyExpensesDataUpdate;

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId);

    if (!expenses) throw appError('MONTHLY_EXPESES_NOT_FOUND', 'Monthly expenses not found',404);

    const resultUpdate = await monthlyExpensesModel.updateMonthlyExpneses(expensesId, fields, updated_by);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed',500);

    return resultUpdate;
}


async function serviceDeleteMonthlyExpneses(expensesId) {

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId);
    if (!expenses) throw appError('MONTHLY_EXPESES_NOT_FOUND', 'Monthly expenses not found',404);

    const deleted = await monthlyExpensesModel.deleteMonthlyExpneses(expensesId)
    if (!deleted) throw appError('DELETE_FAILED', 'Delete operation failed',500);

    return deleted;
}


export default { serviceCreateMonthlyExpneses, serviceGetAllMonthlyExpneses, serviceGetMonthlyExpneses, serviceUpdateMonthlyExpneses, serviceDeleteMonthlyExpneses }