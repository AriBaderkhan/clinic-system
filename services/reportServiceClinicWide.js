import reportsModel from '../models/reportsModel.js'
import resolveReportDateRange from '../utils/reportsDateRange.js'

async function serviceDetailsReportPdf({ month, from, to }, tenant_id) {

    // Phase 1 — resolve the period first (every query below needs the window).
    const period = await resolveReportDateRange({ month, from, to })
    const queryFrom = period.from;
    const queryTo = period.to;

    // Phase 2 — independent reads run in parallel (one batch instead of ~10
    // sequential round-trips). Money stays per branch AND per currency.
    const [
        clinic_name,
        registeredpatientsBranch,
        allApptsBranch,
        patientsHasApptBranch,
        apptForEachDoctorBranch,
        apptsDoneByStatusBranch,
        sessions,
        plans,
        expenses,
        theMostWorkDoneBranch,
        theLeastWorkDoneBranch,
    ] = await Promise.all([
        reportsModel.getTenantName(tenant_id),
        reportsModel.registeredPatientByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.getApptsByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.patientsHasApptByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.apptForEachDoctorByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.apptsDoneByStatusByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.sessionsRevByBranchCurrency(queryFrom, queryTo, tenant_id),
        reportsModel.plansRevByBranchCurrency(queryFrom, queryTo, tenant_id),
        reportsModel.expensesByBranchCurrency(queryFrom, queryTo, tenant_id),
        reportsModel.theMostWorkDoneByBranch(queryFrom, queryTo, tenant_id),
        reportsModel.theLeastWorkDoneByBranch(queryFrom, queryTo, tenant_id),
    ]);

    // Bucket by branch + currency.
    const map = new Map();
    const ensure = (branch, cur) => {
        const c = cur || 'IQD';
        const key = `${branch}|${c}`;
        if (!map.has(key)) map.set(key, { branch_name: branch, currency_code: c, total_session: 0, total_treatment_plans: 0, total_expense: 0 });
        return map.get(key);
    };
    sessions.forEach((r) => { ensure(r.branch_name, r.currency_code).total_session += Number(r.total || 0); });
    plans.forEach((r) => { ensure(r.branch_name, r.currency_code).total_treatment_plans += Number(r.total || 0); });
    expenses.forEach((r) => { ensure(r.branch_name, r.currency_code).total_expense += Number(r.total || 0); });

    const financialsByBranch = [...map.values()]
        .map((f) => {
            const total_revenue = f.total_session + f.total_treatment_plans;
            const profit = total_revenue > f.total_expense ? total_revenue - f.total_expense : 0;
            const loss = total_revenue < f.total_expense ? f.total_expense - total_revenue : 0;
            return { ...f, total_revenue, profit, loss };
        })
        .sort((a, b) => a.branch_name.localeCompare(b.branch_name) || a.currency_code.localeCompare(b.currency_code));

    // Grand totals PER CURRENCY (across all branches).
    const gmap = new Map();
    financialsByBranch.forEach((f) => {
        if (!gmap.has(f.currency_code)) {
            gmap.set(f.currency_code, { currency_code: f.currency_code, total_session: 0, total_treatment_plans: 0, total_revenue: 0, total_expense: 0, profit: 0, loss: 0 });
        }
        const g = gmap.get(f.currency_code);
        g.total_session += f.total_session;
        g.total_treatment_plans += f.total_treatment_plans;
        g.total_revenue += f.total_revenue;
        g.total_expense += f.total_expense;
        g.profit += f.profit;
        g.loss += f.loss;
    });
    const grandTotals = [...gmap.values()].sort((a, b) => a.currency_code.localeCompare(b.currency_code));

    return {
        period,
        clinic_name,
        patientsBranch: registeredpatientsBranch,
        all_appointmentsBranch: allApptsBranch,
        patientsHasApptBranch: patientsHasApptBranch,
        apptForEachDoctorBranch: apptForEachDoctorBranch,
        apptsDoneByStatusBranch: apptsDoneByStatusBranch,

        // Financials: one row per branch+currency, plus grand totals per currency.
        financialsByBranch,
        grandTotals,

        // Raw per-branch work rows (rendered as a list in the PDF).
        most_work_doneBranch: theMostWorkDoneBranch,
        least_work_doneBranch: theLeastWorkDoneBranch,
    };
}

export { serviceDetailsReportPdf }
