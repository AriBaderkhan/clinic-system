import docModel from '../models/docModel.js';
import dateRange from '../utils/dateRange.js';
import appError from '../utils/appError.js';

async function serviceGetAllDocs() {
    const docs = await docModel.getAllDocs();

    if (!docs || docs.length === 0) throw appError('FETCH_DOCS_FAILIED', 'No doctors found',404);
    return docs;
}

async function serviceActiveTodayAppt(doc_id) {

    const todayAppt = dateRange.getDateRange('today');

    if (!todayAppt || !todayAppt.from || !todayAppt.to) throw appError('ACTIVE_TODAY_APPT', 'Could not compute date range for today',400);

    const appointments = await docModel.activeTodayAppt({
        from: todayAppt ? todayAppt.from : null,
        to: todayAppt ? todayAppt.to : null,
        doc_id
    });

    return appointments;
}

const VALID_DAY_FILTERS = ['today', 'yesterday', 'last_week', 'last_month'];
const VALID_TYPE_FILTERS = ['normal', 'urgent', 'walk_in'];

async function serviceListApptsPerDoctor(rawFilters = {}) {
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

    // 4) Build date range (or null)
    const range = dayFilter ? dateRange.getDateRange(dayFilter) : null;

    // 5) Call model (SQL layer) with clean filters
    const appointments = await docModel.findApptsPerDoctorWithFilters({
        from: range ? range.from : null,
        to: range ? range.to : null,
        type: typeFilter,
        search: searchFilter,
        doc_id
    });

    return appointments;
}

async function serviceGetSessionByApptIdPerDoc(appointmentId,doc_id) {

    const sessionForAppt = await docModel.getSessionByApptIdPerDoc(appointmentId, doc_id);
    if (!sessionForAppt) throw appError('SESSION_FOR_APPOINTMENT_NOT_FOUND', 'Session for appointment not found',404);
    return sessionForAppt;
}

export default { serviceGetAllDocs, serviceActiveTodayAppt, serviceListApptsPerDoctor, serviceGetSessionByApptIdPerDoc}   