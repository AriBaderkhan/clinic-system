import monthlyExpensesModel from '../models/monthlyExpensesModel.js'
import appError from '../utils/appError.js';


async function serviceCreateMonthlyExpneses(monthlyExpensesDetail, tenant_id, branch_id) {

    const monthlyExpenses = await monthlyExpensesModel.createMonthlyExpneses(monthlyExpensesDetail, tenant_id, branch_id);

    if (!monthlyExpenses) throw appError('INSERT_FAILED', 'Failed to create monthly expenses', 404);
    return monthlyExpenses;
}

async function serviceGetAllMonthlyExpneses(tenant_id, branch_id, type, month) {
    const expenses = await monthlyExpensesModel.getAllMonthlyExpneses(tenant_id, branch_id, type, month);

    if (!expenses || expenses.length === 0) return [];
    return expenses;
}

async function serviceGetMonthlyExpneses(expensesId, tenant_id, branch_id) {

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId, tenant_id, branch_id);

    if (!expenses) throw appError('FETCH_MONTHLY_EXPENSES_FAILIED', 'No monthly expenses found', 404);
    return expenses;
}

async function serviceUpdateMonthlyExpneses(monthlyExpensesDataUpdate, tenant_id, branch_id) {
    const { expensesId, fields, updated_by } = monthlyExpensesDataUpdate;

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId, tenant_id, branch_id);

    if (!expenses) throw appError('MONTHLY_EXPESES_NOT_FOUND', 'Monthly expenses not found', 404);

    const resultUpdate = await monthlyExpensesModel.updateMonthlyExpneses(expensesId, fields, updated_by, tenant_id, branch_id);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed', 500);

    return resultUpdate;
}


async function serviceDeleteMonthlyExpneses(expensesId, tenant_id, branch_id) {

    const expenses = await monthlyExpensesModel.getMonthlyExpneses(expensesId, tenant_id, branch_id);
    if (!expenses) throw appError('MONTHLY_EXPESES_NOT_FOUND', 'Monthly expenses not found', 404);

    const deleted = await monthlyExpensesModel.deleteMonthlyExpneses(expensesId, tenant_id, branch_id)
    if (!deleted) throw appError('DELETE_FAILED', 'Delete operation failed', 500);

    return deleted;
}



async function getAvailableMonths(tenant_id, branch_id) {
    return await monthlyExpensesModel.getAvailableMonths(tenant_id, branch_id);
}

async function getAvailableTypes(tenant_id, branch_id) {
    return await monthlyExpensesModel.getAvailableTypes(tenant_id, branch_id);
}

export default {
    serviceCreateMonthlyExpneses, serviceGetAllMonthlyExpneses, serviceGetMonthlyExpneses,
    serviceUpdateMonthlyExpneses, serviceDeleteMonthlyExpneses, getAvailableMonths, getAvailableTypes
}