import monthlyExpensesService from '../services/monthlyExpensesService.js'
import asyncWrap from '../utils/asyncWrap.js';


const controllerCreateMonthlyExpneses = asyncWrap(async (req, res) => {
    const { type, amount, expense_date, note } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const monthlyExpensesDetail = { type, amount, expense_date, note, created_by }

    const result = await monthlyExpensesService.serviceCreateMonthlyExpneses(monthlyExpensesDetail, tenant_id, branch_id)
    res.status(200).json({ message: "created successfully", data: result })
})

const controllerGetAllMonthlyExpneses = asyncWrap(async (req, res) => {
    const { type, month } = req.query;
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.serviceGetAllMonthlyExpneses(tenant_id, branch_id, type, month);
    return res.status(200).json({ message: 'All monhly Expenses are here\n', data: result })
})

const controllerGetMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)
    const { tenant_id, branch_id } = req.user;

    const result = await monthlyExpensesService.serviceGetMonthlyExpneses(expensesId, tenant_id, branch_id);
    return res.status(200).json({ message: `monthly expenses with id ${expensesId} is here\n`, data: result })
})


const controllerUpdateMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId);
    const updated_by = req.user.id;
    const fields = req.body;
    const { tenant_id, branch_id } = req.user;

    const monthlyExpensesDataUpdate = { expensesId, updated_by, fields }

    const result = await monthlyExpensesService.serviceUpdateMonthlyExpneses(monthlyExpensesDataUpdate, tenant_id, branch_id);
    return res.status(200).json({ message: `monthly expneses with id ${expensesId} updated successfully`, data: result });
})

const controllerDeleteMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)
    const { tenant_id, branch_id } = req.user;

    const result = await monthlyExpensesService.serviceDeleteMonthlyExpneses(expensesId, tenant_id, branch_id)
    return res.status(204).json({ message: `Deleted succesfully monthly expenses with id ${expensesId}`, data: result })
})

const getAvailableMonths = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.getAvailableMonths(tenant_id, branch_id);
    res.status(200).json({
        message: 'Available months retrieved successfully',
        data: result
    });
})

const getAvailableTypes = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.getAvailableTypes(tenant_id, branch_id);
    res.status(200).json({
        message: 'Available types retrieved successfully',
        data: result
    });
})


export default {
    controllerCreateMonthlyExpneses, controllerGetAllMonthlyExpneses,
    controllerGetMonthlyExpneses, controllerUpdateMonthlyExpneses, controllerDeleteMonthlyExpneses,
    getAvailableMonths, getAvailableTypes
}