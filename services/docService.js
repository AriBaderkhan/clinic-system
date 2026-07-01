import docModel from '../models/docModel.js';
import dateRange from '../utils/dateRange.js';
import settingModel from '../models/settingModel.js';
import resolveReportDateRange from '../utils/reportsDateRange.js';
import appError from '../utils/appError.js';

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

export default { getAll, getActiveToday, getAppointments, getSession, getMyReport }