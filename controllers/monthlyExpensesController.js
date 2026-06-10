import monthlyExpensesService from '../services/monthlyExpensesService.js'
import asyncWrap from '../utils/asyncWrap.js';

const create = asyncWrap(async (req, res) => {
    const { type, amount, expense_date, note } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const monthlyExpensesDetail = { type, amount, expense_date, note, created_by }

    const result = await monthlyExpensesService.create(monthlyExpensesDetail, tenant_id, branch_id)
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const { type, month } = req.query;
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.getAll(tenant_id, branch_id, type, month);
    res.status(200).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)
    const { tenant_id, branch_id } = req.user;

    const result = await monthlyExpensesService.getById(expensesId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId);
    const updated_by = req.user.id;
    const fields = req.body;
    const { tenant_id, branch_id } = req.user;

    const monthlyExpensesDataUpdate = { expensesId, updated_by, fields }

    const result = await monthlyExpensesService.update(monthlyExpensesDataUpdate, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const expensesId = Number(req.params.expensesId)
    const { tenant_id, branch_id } = req.user;

    await monthlyExpensesService.delete(expensesId, tenant_id, branch_id)
    res.status(200).json({ ok: true });
})

const getAvailableMonths = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.getAvailableMonths(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAvailableTypes = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await monthlyExpensesService.getAvailableTypes(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default {
    create, getAll, getById, update,
    delete: _delete, getAvailableMonths, getAvailableTypes
}