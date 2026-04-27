import reportsModel from '../models/reportsModel.js'
import resolveReportDateRange from '../utils/reportsDateRange.js'


async function serviceMonthlyReportPdf({ month, from, to }, tenant_id, branch_id) {

    //Phase 1
    const period = await resolveReportDateRange({ month, from, to })
    const queryFrom = period.from;
    const queryTo = period.to;

    //Phase 2
    const registeredpatients = await reportsModel.registeredPatient(queryFrom, queryTo, tenant_id, branch_id)
    const allAppts = await reportsModel.getAppts(queryFrom, queryTo, tenant_id, branch_id)
    const patientsHasAppt = await reportsModel.patientsHasAppt(queryFrom, queryTo, tenant_id, branch_id)
    const apptForEachDoctor = await reportsModel.apptForEachDoctor(queryFrom, queryTo, tenant_id, branch_id)
    const apptsDoneByStatus = await reportsModel.apptsDoneByStatus(queryFrom, queryTo, tenant_id, branch_id)

    //Phase 3
    const sumOfSessionsAmount = await reportsModel.sumOfSessionsAmount(queryFrom, queryTo, tenant_id, branch_id)
    const sumOfTpAmount = await reportsModel.sumOfTreatmentPlansAmount(queryFrom, queryTo, tenant_id, branch_id)
    const total_revenue = sumOfSessionsAmount + sumOfTpAmount
    const expenses = await reportsModel.monthlyExpenses(queryFrom, queryTo, tenant_id, branch_id)

    let profit = 0
    let loss = 0
    if (total_revenue > expenses) {
        profit = total_revenue - expenses
    } else {
        loss = expenses - total_revenue
    }

    //Phase 4
    const theMostWorkDone = await reportsModel.theMostWorkDone(queryFrom, queryTo, tenant_id, branch_id)
    const theLeastWorkDone = await reportsModel.theLeastWorkDone(queryFrom, queryTo, tenant_id, branch_id)

    return {
        period,
        patients: registeredpatients,
        all_appointments: allAppts,
        patientsHasAppt: patientsHasAppt,
        apptForEachDoctor: apptForEachDoctor,
        apptsDoneByStatus: apptsDoneByStatus,
        total_session: sumOfSessionsAmount,
        total_treatment_plans_amount: sumOfTpAmount,
        revenue: total_revenue,
        expense: expenses,
        profit: profit,
        loss: loss,
        most_work_done: {
            name: theMostWorkDone.work_code,
            quantity: theMostWorkDone.total_qty
        },
        least_work_done: {
            name: theLeastWorkDone.work_code,
            quantity: theLeastWorkDone.total_qty
        }
    };
}

export { serviceMonthlyReportPdf }