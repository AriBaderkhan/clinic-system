import monthlyExpensesModel from '../models/monthlyExpensesModel.js'
import appError from '../utils/appError.js';


async function create(monthlyExpensesDetail, tenant_id, branch_id) {

    const monthlyExpenses = await monthlyExpensesModel.createMonthlyExpenses(monthlyExpensesDetail, tenant_id, branch_id);

    if (!monthlyExpenses) throw appError('INSERT_FAILED', 'Failed to create monthly expenses', 404);
    return monthlyExpenses;
}

async function getAll(tenant_id, branch_id, type, month) {
    const expenses = await monthlyExpensesModel.getAllMonthlyExpenses(tenant_id, branch_id, type, month);

    if (!expenses || expenses.length === 0) return [];
    return expenses;
}

async function getById(expensesId, tenant_id, branch_id) {

    const expenses = await monthlyExpensesModel.getMonthlyExpenses(expensesId, tenant_id, branch_id);

    if (!expenses) throw appError('EXPENSE_NOT_FOUND', 'Expense not found', 404);
    return expenses;
}

async function update(monthlyExpensesDataUpdate, tenant_id, branch_id) {
    const { expensesId, fields, updated_by } = monthlyExpensesDataUpdate;
    if (!fields || Object.keys(fields).length === 0) throw appError('NOTHING_TO_UPDATE', 'Nothing to update', 400);

    const expenses = await monthlyExpensesModel.getMonthlyExpenses(expensesId, tenant_id, branch_id);

    if (!expenses) throw appError('EXPENSE_NOT_FOUND', 'Expense not found', 404);

    const resultUpdate = await monthlyExpensesModel.updateMonthlyExpenses(expensesId, fields, updated_by, tenant_id, branch_id);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed', 500);

    return resultUpdate;
}


async function _delete(expensesId, tenant_id, branch_id) {

    const expenses = await monthlyExpensesModel.getMonthlyExpenses(expensesId, tenant_id, branch_id);
    if (!expenses) throw appError('EXPENSE_NOT_FOUND', 'Expense not found', 404);

    const deleted = await monthlyExpensesModel.deleteMonthlyExpenses(expensesId, tenant_id, branch_id)
    if (!deleted) throw appError('EXPENSE_NOT_FOUND', 'Expense not found', 404);

    return deleted;
}



async function getAvailableMonths(tenant_id, branch_id) {
    return await monthlyExpensesModel.getAvailableMonths(tenant_id, branch_id);
}

async function getAvailableTypes(tenant_id, branch_id) {
    return await monthlyExpensesModel.getAvailableTypes(tenant_id, branch_id);
}

export default {
    create, getAll, getById, update, delete: _delete, getAvailableMonths, getAvailableTypes
}