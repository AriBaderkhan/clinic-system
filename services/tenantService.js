import tenantModel from '../models/tenantModel.js';
import reportsModel from '../models/reportsModel.js';
import pool from '../db_connection.js';
import branchModel from '../models/branchModel.js';
import appError from '../utils/appError.js';

async function getDetails(tenantId) {
    // Pass undefined as first arg to use the default 'pool' defined in the model
    const tenant = await tenantModel.getTenantDetails(undefined, tenantId);
    return tenant;
}

async function update(fields, tenantId) {
    const tenant = await tenantModel.updateTenant(fields, tenantId);
    return tenant;
}

async function getBranches(tenantId) {
    const branches = await tenantModel.getAllBranches(tenantId);
    return branches;
}

async function createBranch(tenantId, branchData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { name, location, timezone, currency_code } = branchData;
        const branch = await tenantModel.createBranch(client, tenantId, name, location);
        const branchId = branch.id;

        const tenant = await tenantModel.getTenantDetails(undefined, tenantId);
        let timezoneUse = tenant.timezone;
        let currency_codeUse = tenant.currency_code;
        if (timezone) {
            timezoneUse = timezone;
        }
        if (currency_code) {
            currency_codeUse = currency_code;
        }
        await tenantModel.createBranchSettings(client, branchId, tenantId, timezoneUse, currency_codeUse);
        await client.query('COMMIT');
        return branch;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function updateBranch(branchData, targetBranchId, tenant_id) {
    const branch = await tenantModel.updateBranch(branchData, targetBranchId, tenant_id);
    return branch;
}

async function deleteBranch(branchId, tenantId) {
    const branch = await tenantModel.deleteBranch(branchId, tenantId);
    const branchSettings = await tenantModel.deleteBranchSettings(branchId, tenantId);
    return branch;
}



async function switchBranch(tenant_id, branchId) {

    const branch = await branchModel.findBranchById(branchId);
    if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
    if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);

    const isTrue = await tenantModel.branchBelongsToTenant(branchId, tenant_id);
    if (!isTrue) {
        throw appError('BRANCH_NOT_FOUND', 'Branch not found in tenant', 404);
}

return branch;

}

// Asia/Baghdad is UTC+3 with no daylight-saving, so a fixed offset is safe and
// keeps "today" / "this month" aligned with the clinic's real calendar day.
const CLINIC_TZ_OFFSET_HOURS = 3;

// Boundaries (as UTC Date objects) for the clinic's local "today" and "this
// month". Queries compare against timestamp columns, so we shift the local
// wall-clock day start back into UTC.
function clinicDateRanges() {
    const now = new Date();
    const offsetMs = CLINIC_TZ_OFFSET_HOURS * 3600 * 1000;
    const wall = new Date(now.getTime() + offsetMs); // Baghdad wall-clock in UTC fields
    const todayStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
    const monthStartUtc = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1);
    const todayStart = new Date(todayStartUtc - offsetMs);
    const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000);
    const monthStart = new Date(monthStartUtc - offsetMs);
    return { todayStart, todayEnd, monthStart, now };
}

function sumTotals(rows, key = 'total') {
    return (rows || []).reduce((acc, r) => acc + Number(r[key] || 0), 0);
}

function countStatus(rows, status) {
    return (rows || [])
        .filter((r) => r.status === status)
        .reduce((acc, r) => acc + Number(r.status_total || 0), 0);
}

// Collapse per-branch treatment rows ([{branch_name,label,total}]) into a single
// ranked list by treatment name for the chart. Pass a branchName to limit to one
// branch, or null to aggregate across all branches.
function aggregateTreatments(rows, branchName = null, limit = 8) {
    const map = new Map();
    for (const r of rows || []) {
        if (branchName && r.branch_name !== branchName) continue;
        map.set(r.label, (map.get(r.label) || 0) + Number(r.total || 0));
    }
    return [...map.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

// Value of a per-branch count row ([{branch_name,total}]) for one branch.
function branchValue(rows, branchName, key = 'total') {
    return Number((rows || []).find((r) => r.branch_name === branchName)?.[key] || 0);
}

// Appointment status tally for one branch (status=null → grand total).
function branchStatus(rows, branchName, status = null) {
    return (rows || [])
        .filter((r) => r.branch_name === branchName && (status ? r.status === status : true))
        .reduce((acc, r) => acc + Number(r.status_total || 0), 0);
}

async function getDashboard(tenant_id) {
    const base = await tenantModel.getDashboardStats(tenant_id); // active_branches, total_users
    const { todayStart, todayEnd, monthStart, now } = clinicDateRanges();

    const [
        branches, newPatients, returningPatients, statusRows, apptList, sessionRev, planRev, treatmentRows,
    ] = await Promise.all([
        reportsModel.getTenantBranches(tenant_id),
        reportsModel.registeredPatientByBranch(todayStart, todayEnd, tenant_id),
        reportsModel.returningPatientsByBranch(todayStart, todayEnd, tenant_id),
        reportsModel.apptsDoneByStatusByBranch(todayStart, todayEnd, tenant_id),
        reportsModel.appointmentsListByBranch(todayStart, todayEnd, tenant_id),
        reportsModel.sumOfSessionsAmountByBranch(monthStart, now, tenant_id),
        reportsModel.sumOfTreatmentPlansAmountByBranch(monthStart, now, tenant_id),
        reportsModel.treatmentBreakdownByBranch(monthStart, now, tenant_id),
    ]);

    // Per-branch breakdown so the dashboard can switch between "All branches"
    // (the totals below) and a single branch without another round-trip.
    const perBranch = (branches || []).map((b) => ({
        id: b.id,
        name: b.name,
        new_patients: branchValue(newPatients, b.name),
        returning_patients: branchValue(returningPatients, b.name),
        appointments: {
            total: branchStatus(statusRows, b.name),
            done: branchStatus(statusRows, b.name, 'completed'),
            scheduled: branchStatus(statusRows, b.name, 'scheduled'),
        },
        revenue: branchValue(sessionRev, b.name, 'total_paid') + branchValue(planRev, b.name, 'total_paid'),
        treatments: aggregateTreatments(treatmentRows, b.name),
    }));

    return {
        ...base,
        branches: perBranch,
        today_new_patients: sumTotals(newPatients),
        today_returning_patients: sumTotals(returningPatients),
        today_appointments: {
            total: sumTotals(statusRows, 'status_total'),
            done: countStatus(statusRows, 'completed'),
            scheduled: countStatus(statusRows, 'scheduled'),
            list: apptList,
        },
        month_revenue: sumTotals(sessionRev, 'total_paid') + sumTotals(planRev, 'total_paid'),
        treatments_month: aggregateTreatments(treatmentRows),
    };
}

export default {
    getDetails,
    update,
    getBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    switchBranch,
    getDashboard
}