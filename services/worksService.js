import worksModel from "../models/workCatalogModel.js";
import appError from "../utils/appError.js";
import pool from "../db_connection.js";

const create = async (workData, tenant_id, branch_id) => {
    const client = await pool.connect();
    let { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth } = workData;
    try {

        await client.query('BEGIN');
        code = code.toUpperCase();
        const existingWork = await worksModel.getWorkByType(code, tenant_id, branch_id, client);
        if (existingWork) throw appError('WORK_ALREADY_EXISTS', 'Work with this code already exists', 400);

        const work = await worksModel.createWork(code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, !!is_plan, !!is_whole_mouth, client);
        if (!work) throw appError('WORK_CREATION_FAILED', 'Failed to create work', 500);

        await client.query('COMMIT');
        return work;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

const getAll = async (tenant_id, branch_id) => {
    const works = await worksModel.getWorks(tenant_id, branch_id);
    return works;
}

const getById = async (workId, tenant_id, branch_id) => {
    const work = await worksModel.getWorkById(workId, tenant_id, branch_id);
    if (!work) throw appError('WORK_NOT_FOUND', 'Work not found', 404);
    return work;
}

const update = async (workId, workData, tenant_id, branch_id) => {
    const client = await pool.connect();
    let { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth } = workData;
    try {
        await client.query('BEGIN');
        code = code.toUpperCase();
        const existing = await worksModel.getWorkByType(code, tenant_id, branch_id, client);
        if (existing && existing.id !== Number(workId)) throw appError('WORK_ALREADY_EXISTS', 'Work with this code already exists', 400);
        const work = await worksModel.updateWork(workId, { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan: !!is_plan, is_whole_mouth: !!is_whole_mouth }, tenant_id, branch_id, client);
        if (!work) throw appError('WORK_NOT_FOUND', 'Work not found', 404);
        await client.query('COMMIT');
        return work;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


const _delete = async (workId, tenant_id, branch_id) => {
    const work = await worksModel.deleteWork(workId, tenant_id, branch_id);
    if (!work) throw appError('WORK_NOT_FOUND', 'Work not found', 404);
    return work;
}

export default { create, getAll, getById, update, delete: _delete }

