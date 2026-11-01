import docModel from '../models/docModel.js';
import dateRange from '../utils/dateRange.js';
import settingModel from '../models/settingModel.js';
import resolveReportDateRange from '../utils/reportsDateRange.js';
import appError from '../utils/appError.js';
import specialtyModel from '../models/specialtyModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import withTransaction from '../utils/withTransaction.js';

async function getAll(tenant_id, branch_id) {
    const docs = await docModel.getAllDocs(tenant_id, branch_id);

    if (!docs || docs.length === 0) throw appError('FETCH_DOCS_FAILIED', 'No doctors found', 404);
    return docs;
}

async function getActiveToday(doc_id, tenant_id, branch_id) {

    const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id);
    const todayAppt = dateRange.getDateRange('today', settings?.timezone);

    if (!todayAppt || !todayAppt.from || !todayAppt.to) throw appError('ACTIVE_TODAY_APPT', 'Could not compute date range for today', 400);

    const appointments = await docModel.activeTodayAppt({
        from: todayAppt ? todayAppt.from : null,
        to: todayAppt ? todayAppt.to : null,
        doc_id
    }, tenant_id, branch_id);

    return appointments;
}

// All of the doctor's unfinished (in_progress) appointments, any date. Powers the
// dashboard "unfinished visits" button so a visit started on a past day and never
// closed is never lost.
async function getOpenAppts(doc_id, tenant_id, branch_id) {
    const appointments = await docModel.openApptsPerDoctor(doc_id, tenant_id, branch_id);
    return appointments;
}

const VALID_DAY_FILTERS = ['today', 'yesterday', 'last_week', 'last_month'];
const VALID_TYPE_FILTERS = ['normal', 'urgent', 'walk_in'];

async function getAppointments(rawFilters = {}, tenant_id, branch_id) {
    const { day, type, search, doc_id } = rawFilters;

    // 1) Normalize / validate day filter
    const dayFilter = VALID_DAY_FILTERS.includes(day) ? day : null;

    // 2) Normalize / validate type filter
    const typeFilter = VALID_TYPE_FILTERS.includes(type) ? type : null;

    // 3) Normalize search (empty string → null)
    const searchFilter =
        typeof search === "string" && search.trim().length > 0
            ? search.trim()
            : null;

    // 4) Build date range (or null) — in the clinic's timezone
    const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id);
    const range = dayFilter ? dateRange.getDateRange(dayFilter, settings?.timezone) : null;

    // 5) Call model (SQL layer) with clean filters
    const appointments = await docModel.findApptsPerDoctorWithFilters({
        from: range ? range.from : null,
        to: range ? range.to : null,
        type: typeFilter,
        search: searchFilter,
        doc_id
    }, tenant_id, branch_id);

    return appointments;
}

async function getSession(appointmentId, doc_id, tenant_id, branch_id) {

    const sessionForAppt = await docModel.getSessionByApptIdPerDoc(appointmentId, doc_id, tenant_id, branch_id);
    if (!sessionForAppt) throw appError('SESSION_FOR_APPOINTMENT_NOT_FOUND', 'Session for appointment not found', 404);
    return sessionForAppt;
}

// The logged-in doctor's own report for a period (current branch only). Uses the
// same date-range resolver as the general branch report so month/custom behave
// identically.
function statusTotal(rows, status) {
    return (rows || [])
        .filter((r) => (status ? r.status === status : true))
        .reduce((acc, r) => acc + Number(r.total || 0), 0);
}

async function getMyReport({ month, from, to }, doc_id, tenant_id, branch_id) {
    const period = await resolveReportDateRange({ month, from, to });

    const [header, rev, statusRows, works] = await Promise.all([
        docModel.getReportHeader(doc_id, tenant_id, branch_id),
        docModel.doctorRevenue(period.from, period.to, tenant_id, branch_id, doc_id),
        docModel.doctorApptCountsByStatus(period.from, period.to, tenant_id, branch_id, doc_id),
        docModel.doctorWorksBreakdown(period.from, period.to, tenant_id, branch_id, doc_id),
    ]);

    // Revenue per currency (never mixed): [{ currency_code, sessions, treatment_plans, total }]
    const revenue = (rev || [])
        .map((r) => {
            const sessions = Number(r.session_total || 0);
            const treatment_plans = Number(r.tp_total || 0);
            return { currency_code: r.currency_code || 'IQD', sessions, treatment_plans, total: sessions + treatment_plans };
        })
        .sort((a, b) => a.currency_code.localeCompare(b.currency_code));

    const worksList = (works || []).map((w) => ({
        name: w.label,
        code: w.code,
        quantity: Number(w.qty || 0),
    }));

    return {
        period,
        clinic_name: header?.clinic_name || null,
        doctor_name: header?.doctor_name || null,
        branch_name: header?.branch_name || null,
        revenue,
        appointments: {
            completed: statusTotal(statusRows, 'completed'),
            scheduled: statusTotal(statusRows, 'scheduled'),
            total: statusTotal(statusRows, null),
            by_status: statusRows,
        },
        works_count: worksList.reduce((acc, w) => acc + w.quantity, 0),
        works: worksList,
    };
}

// a doctor's specialty + the extra treatments the manager ticked for them
async function getSettings(doctor_id, tenant_id, branch_id) {
    const doctor = await docModel.getDoctorSpecialty(doctor_id, tenant_id, branch_id);
    if (!doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);
    const extra_work_ids = await docModel.getExtraWorkIds(doctor_id, tenant_id, branch_id);
    return { specialty_id: doctor.specialty_id, extra_work_ids };
}

// Saves the specialty and REPLACES the extra treatments list in one transaction.
// Old visits are not touched: their saved treatments stay as they are.
async function saveSettings(doctor_id, { specialty_id, extra_work_ids }, tenant_id, branch_id) {
    return withTransaction(async (client) => {
        const doctor = await docModel.lockDoctor(doctor_id, tenant_id, branch_id, client);
        if (!doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);

        if (specialty_id != null) {
            const specialty = await specialtyModel.getById(specialty_id, tenant_id, branch_id, client);
            if (!specialty) throw appError('SPECIALTY_NOT_FOUND', 'Specialty not found', 404);
        }

        const ids = [...new Set(extra_work_ids.map(Number))];
        if (ids.length > 0) {
            const works = await workCatalogModel.getWorksByIds(ids, tenant_id, branch_id, client);
            if (works.filter(w => w.is_active).length !== ids.length) throw appError('WORK_NOT_FOUND', 'Work not found', 404);
        }

        await docModel.setSpecialty(doctor_id, specialty_id ?? null, tenant_id, branch_id, client);
        await docModel.deleteExtraWorks(doctor_id, tenant_id, branch_id, client);
        if (ids.length > 0) await docModel.addExtraWorks(doctor_id, ids, tenant_id, branch_id, client);

        return { specialty_id: specialty_id ?? null, extra_work_ids: ids.sort((a, b) => a - b) };
    });
}

export default { getAll, getActiveToday, getOpenAppts, getAppointments, getSession, getMyReport, getSettings, saveSettings }