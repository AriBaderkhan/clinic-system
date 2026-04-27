import reportsModel from '../models/reportsModel.js'
import resolveReportDateRange from '../utils/reportsDateRange.js'

// Helper to sum up from a list of branches
function sumList(list, key) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

async function serviceDetailsReportPdf({ month, from, to }, tenant_id) {

    //Phase 1
    const period = await resolveReportDateRange({ month, from, to })
    const queryFrom = period.from;
    const queryTo = period.to;

    //Phase 2
    const registeredpatientsBranch = await reportsModel.registeredPatientByBranch(queryFrom, queryTo, tenant_id)
    const allApptsBranch = await reportsModel.getApptsByBranch(queryFrom, queryTo, tenant_id)
    const patientsHasApptBranch = await reportsModel.patientsHasApptByBranch(queryFrom, queryTo, tenant_id)
    const apptForEachDoctorBranch = await reportsModel.apptForEachDoctorByBranch(queryFrom, queryTo, tenant_id)
    const apptsDoneByStatusBranch = await reportsModel.apptsDoneByStatusByBranch(queryFrom, queryTo, tenant_id)

    //Phase 3
    const sessions = await reportsModel.sumOfSessionsAmountByBranch(queryFrom, queryTo, tenant_id)
    const plans = await reportsModel.sumOfTreatmentPlansAmountByBranch(queryFrom, queryTo, tenant_id)
    const expenses = await reportsModel.monthlyExpensesByBranch(queryFrom, queryTo, tenant_id)

    // Merge lists to calculate totals PER BRANCH (like your audio requested)
    // We collect all unique branch names first
    const branchNames = new Set([
        ...sessions.map(i => i.branch_name),
        ...plans.map(i => i.branch_name),
        ...expenses.map(i => i.branch_name)
    ]);

    // Loop through each branch and calculate specific totals
    const financialsByBranch = Array.from(branchNames).map(branchName => {
        const s = Number(sessions.find(i => i.branch_name === branchName)?.total_paid || 0);
        const p = Number(plans.find(i => i.branch_name === branchName)?.total_paid || 0);
        const e = Number(expenses.find(i => i.branch_name === branchName)?.total_expenses || 0);

        const total_revenue = s + p;

        // Calculate profit/loss per branch
        let profit = 0;
        let loss = 0;
        if (total_revenue > e) {
            profit = total_revenue - e;
        } else {
            loss = e - total_revenue;
        }

        return {
            branch_name: branchName,
            total_session: s,
            total_treatment_plans: p,
            total_revenue,
            total_expense: e,
            profit,
            loss
        };
    });

    // Also calculate Grand Totals for the whole report
    const total_revenue = sumList(financialsByBranch, 'total_revenue');
    const total_expense = sumList(financialsByBranch, 'total_expense');
    const total_profit = sumList(financialsByBranch, 'profit');
    const total_loss = sumList(financialsByBranch, 'loss');

    //Phase 4
    const theMostWorkDoneBranch = await reportsModel.theMostWorkDoneByBranch(queryFrom, queryTo, tenant_id)
    const theLeastWorkDoneBranch = await reportsModel.theLeastWorkDoneByBranch(queryFrom, queryTo, tenant_id)

    return {
        period,
        patientsBranch: registeredpatientsBranch,
        all_appointmentsBranch: allApptsBranch,
        patientsHasApptBranch: patientsHasApptBranch,
        apptForEachDoctorBranch: apptForEachDoctorBranch,
        apptsDoneByStatusBranch: apptsDoneByStatusBranch,

        // Financials
        financialsByBranch, // List of { branch_name, total_session, total_revenue, profit ... }

        // Grand Totals
        revenue: total_revenue,
        expense: total_expense,
        profit: total_profit,
        loss: total_loss,

        most_work_doneBranch: {
            name: theMostWorkDoneBranch?.work_code || '-',
            quantity: theMostWorkDoneBranch?.total_qty || 0
        },
        least_work_doneBranch: {
            name: theLeastWorkDoneBranch?.work_code || '-',
            quantity: theLeastWorkDoneBranch?.total_qty || 0
        }
    };
}

export { serviceDetailsReportPdf }