import worksModel from "../models/workCatalogModel.js";
import specialtyModel from "../models/specialtyModel.js";
import docModel from "../models/docModel.js";
import appError from "../utils/appError.js";
import pool from "../db_connection.js";

// a chosen specialty must be a live one of this branch (null = for every doctor)
const checkSpecialty = async (specialty_id, tenant_id, branch_id, client) => {
    if (specialty_id == null) return;
    const specialty = await specialtyModel.getById(specialty_id, tenant_id, branch_id, client);
    if (!specialty) throw appError('SPECIALTY_NOT_FOUND', 'Specialty not found', 404);
}

const create = async (workData, tenant_id, branch_id) => {
    const client = await pool.connect();
    let { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id } = workData;
    try {

        await client.query('BEGIN');
        code = code.toUpperCase();
        const existingWork = await worksModel.getWorkByType(code, tenant_id, branch_id, client);
        if (existingWork) throw appError('WORK_ALREADY_EXISTS', 'Work with this code already exists', 400);
        await checkSpecialty(specialty_id, tenant_id, branch_id, client);

        const work = await worksModel.createWork(code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, !!is_plan, !!is_whole_mouth, specialty_id ?? null, client);
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
    let { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id } = workData;
    try {
        await client.query('BEGIN');
        if (code !== undefined) {
            code = code.toUpperCase();
            const existing = await worksModel.getWorkByType(code, tenant_id, branch_id, client);
            if (existing && existing.id !== Number(workId)) throw appError('WORK_ALREADY_EXISTS', 'Work with this code already exists', 400);
        }
        // installments switched off → no minimum installment
        if (allow_installments === false) min_installment_amount = null;
        if (specialty_id != null) await checkSpecialty(specialty_id, tenant_id, branch_id, client);

        // only the fields that were sent are changed; a missing field keeps its value
        // (before, a missing field was saved as empty: e.g. the work became inactive)
        const sent = { code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id };
        const fields = Object.fromEntries(Object.entries(sent).filter(([, v]) => v !== undefined));
        if (Object.keys(fields).length === 0) throw appError('NOTHING_TO_UPDATE', 'Nothing to update', 400);

        const work = await worksModel.updateWork(workId, fields, tenant_id, branch_id, client);
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

// the treatments one doctor may use + whether their visits show the teeth chart
const getForDoctor = async (doctorId, tenant_id, branch_id) => {
    const doctor = await docModel.getDoctorSpecialty(doctorId, tenant_id, branch_id);
    if (!doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);
    const works = await worksModel.getWorksForDoctor(doctorId, tenant_id, branch_id);
    // no specialty = no limit, same as before specialties existed
    return { works, uses_teeth: doctor.specialty_id == null ? true : !!doctor.uses_teeth };
}

// Used when a visit is saved: every NEW treatment must be allowed for the
// visit's doctor. Treatments already saved in the visit (keepIds) stay
// editable even if the manager unticked them later.
const assertAllowedForDoctor = async (doctorId, workIds, keepIds, tenant_id, branch_id, client) => {
    const keep = new Set((keepIds || []).map(Number));
    const toCheck = [...new Set(workIds.map(Number))].filter(id => !keep.has(id));
    if (toCheck.length === 0) return;
    const allowed = new Set(await worksModel.getAllowedWorkIds(doctorId, toCheck, tenant_id, branch_id, client));
    const blocked = toCheck.filter(id => !allowed.has(id));
    if (blocked.length > 0) {
        throw appError('WORK_NOT_ALLOWED_FOR_DOCTOR', 'This treatment is not allowed for this doctor', 400, { work_ids: blocked });
    }
}

export default { create, getAll, getById, update, delete: _delete, getForDoctor, assertAllowedForDoctor }

