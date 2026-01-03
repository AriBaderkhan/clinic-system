import treatmentPlanModel from '../models/treatmentPlanModel.js';
async function serviceGetActivePlan(patientId,type) {
    const plan = await treatmentPlanModel.getActivePlan(patientId,type);
    return plan;
}


async function serviceGetSessionsForTp(tpId) {

    const sessionsForTp = await treatmentPlanModel.getSessionsForTp(tpId);

    return sessionsForTp;
}

export default { serviceGetActivePlan, serviceGetSessionsForTp }