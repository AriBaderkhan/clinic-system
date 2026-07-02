import reportsModel from '../models/reportsModel.js'
import resolveReportDateRange from '../utils/reportsDateRange.js'

// Fold per-currency money rows into one financials list. Each currency is kept
// on its OWN line — IQD and USD are never added together.
function buildFinancials(sessionRows, planRows, expenseRows) {
    const byCur = new Map();
    const ensure = (code) => {
        const k = code || 'IQD';
        if (!byCur.has(k)) byCur.set(k, { currency_code: k, total_session: 0, total_treatment_plans_amount: 0, expense: 0 });
        return byCur.get(k);
    };
    (sessionRows || []).forEach((r) => { ensure(r.currency_code).total_session += Number(r.total || 0); });
    (planRows || []).forEach((r) => { ensure(r.currency_code).total_treatment_plans_amount += Number(r.total || 0); });
    (expenseRows || []).forEach((r) => { ensure(r.currency_code).expense += Number(r.total || 0); });

    return [...byCur.values()]
        .map((f) => {
            const revenue = f.total_session + f.total_treatment_plans_amount;
            const profit = revenue > f.expense ? revenue - f.expense : 0;
            const loss = revenue < f.expense ? f.expense - revenue : 0;
            return { ...f, revenue, profit, loss };
        })
        .sort((a, b) => a.currency_code.localeCompare(b.currency_code));
}

async function serviceMonthlyReportPdf({ month, from, to }, tenant_id, branch_id) {

    // Phase 1 — resolve the period first (every query below needs the window).
    const period = await resolveReportDateRange({ month, from, to })
    const queryFrom = period.from;
    const queryTo = period.to;

    // Phase 2 — all reads below are independent, so run them in parallel
    // (one batch instead of ~11 sequential round-trips). Money stays per-currency.
    const [
        clinic_name,
        registeredpatients,
        allAppts,
        patientsHasAppt,
        apptForEachDoctor,
        apptsDoneByStatus,
        sessionRows,
        planRows,
        expenseRows,
        theMostWorkDone,
        theLeastWorkDone,
    ] = await Promise.all([
        reportsModel.getTenantName(tenant_id),
        reportsModel.registeredPatient(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.getAppts(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.patientsHasAppt(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.apptForEachDoctor(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.apptsDoneByStatus(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.sessionsRevByCurrency(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.plansRevByCurrency(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.expensesByCurrency(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.theMostWorkDone(queryFrom, queryTo, tenant_id, branch_id),
        reportsModel.theLeastWorkDone(queryFrom, queryTo, tenant_id, branch_id),
    ]);

    const financials = buildFinancials(sessionRows, planRows, expenseRows)

    return {
        period,
        clinic_name,
        patients: registeredpatients,
        all_appointments: allAppts,
        patientsHasAppt: patientsHasAppt,
        apptForEachDoctor: apptForEachDoctor,
        apptsDoneByStatus: apptsDoneByStatus,
        // One financial block per currency: { currency_code, total_session,
        // total_treatment_plans_amount, revenue, expense, profit, loss }
        financials,
        most_work_done: {
            name: theMostWorkDone?.work_code ?? '-',
            quantity: theMostWorkDone?.total_qty ?? 0
        },
        least_work_done: {
            name: theLeastWorkDone?.work_code ?? '-',
            quantity: theLeastWorkDone?.total_qty ?? 0
        }
    };
}

export { serviceMonthlyReportPdf }
