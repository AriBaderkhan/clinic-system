import monthlyExpensesService from '../services/monthlyExpensesService.js'
import asyncWrap from '../utils/asyncWrap.js';


const controllerCreateMonthlyExpneses = asyncWrap(async (req, res) => {
    const { month, materials, salary, company_name, company_total, electric, rent, tax, marketing, other, notes } = req.body
    const created_by = req.user.id;

    const monthlyExpensesDetail = { month, materials, salary, company_name, company_total, electric, rent, tax, marketing, other, notes, created_by }

    const result = await monthlyExpensesService.serviceCreateMonthlyExpneses(monthlyExpensesDetail)
    res.status(200).json({ message: "created successfully", data: result })
})

const controllerGetAllMonthlyExpneses = asyncWrap(async (req, res) => {

    const result = await monthlyExpensesService.serviceGetAllMonthlyExpneses();
    return res.status(200).json({ message: 'All monhly Expenses are here\n', data: result })
})

const controllerGetMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)

    const result = await monthlyExpensesService.serviceGetMonthlyExpneses(expensesId);
    return res.status(200).json({ message: `monthly expenses with id ${expensesId} is here\n`, data: result })
})


const controllerUpdateMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId);
    const updated_by = req.user.id;
    const fields = req.body;

    const monthlyExpensesDataUpdate = { expensesId, updated_by, fields }

    const result = await monthlyExpensesService.serviceUpdateMonthlyExpneses(monthlyExpensesDataUpdate);
    return res.status(200).json({ message: `monthly expneses with id ${expensesId} updated successfully`, data: result });
})

const controllerDeleteMonthlyExpneses = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)

    const result = await monthlyExpensesService.serviceDeleteMonthlyExpneses(expensesId)
    return res.status(204).json({ message: `Deleted succesfully monthly expenses with id ${expensesId}`, data: result })
})

export default { controllerCreateMonthlyExpneses, controllerGetAllMonthlyExpneses, controllerGetMonthlyExpneses, controllerUpdateMonthlyExpneses, controllerDeleteMonthlyExpneses }