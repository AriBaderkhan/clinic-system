import reportsModel from '../models/reportsModel.js'
import monthlyReporteDateRange from '../utils/reportsDateRange.js'


async function serviceMonthlyReportPdf({ month }) {

    //Phase 1
    const period = await monthlyReporteDateRange(month)
    const from = period.from;
    const to = period.to;

    //Phase 2
    const registeredpatients = await reportsModel.registeredPatient(from, to)
    const allAppts = await reportsModel.getAppts(from, to)
    const patientsHasAppt = await reportsModel.patientsHasAppt(from, to)
    const apptForEachDoctor = await reportsModel.apptForEachDoctor(from, to)
    const apptsDoneByStatus = await reportsModel.apptsDoneByStatus(from, to)

    //Phase 3
    const sumOfSessionsAmount = await reportsModel.sumOfSessionsAmount(from, to)
    const sumOfTpAmount = await reportsModel.sumOfTreatmentPlansAmount(from, to)
    const total_revenue = sumOfSessionsAmount + sumOfTpAmount
    const expenses = await reportsModel.monthlyExpenses(month)

    let profit = 0
    let loss = 0
    if(total_revenue > expenses){
         profit = total_revenue - expenses
    } else{
         loss = expenses - total_revenue
    }

    //Phase 4
    const theMostWorkDone = await reportsModel.theMostWorkDone(from,to)
    const theLeastWorkDone = await reportsModel.theLeastWorkDone(from,to)

    return {
        period,
        patients: registeredpatients,
        all_appointments: allAppts,
        patientsHasAppt: patientsHasAppt,
        apptForEachDoctor: apptForEachDoctor,
        apptsDoneByStatus: apptsDoneByStatus,
        total_session: sumOfSessionsAmount,
        total_treatment_plans_amount: sumOfTpAmount,
        revenue:total_revenue,
        expense:expenses,
        profit: profit,
        loss: loss,
        most_work_done:{
            name:theMostWorkDone.work_code,
            quantity:theMostWorkDone.total_qty
        },
        least_work_done:{
            name:theLeastWorkDone.work_code,
            quantity:theLeastWorkDone.total_qty
        }
    };
}

export  { serviceMonthlyReportPdf }