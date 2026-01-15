import treatmentPlanModel from '../models/treatmentPlanModel.js';
async function serviceGetActivePlan(patientId, type) {
    const plan = await treatmentPlanModel.getActivePlan(patientId, type);
    return plan;
}


async function serviceGetSessionsForTp(tpId) {

    const sessionsForTp = await treatmentPlanModel.getSessionsForTp(tpId);

    return sessionsForTp;
}

async function serviceGetAllTreatmentPlansForSection({ isPaid, isCompleted, search }) {
    const tps = await treatmentPlanModel.getAllTreatmentPlansForSection({ isPaid, isCompleted, search, });
    return tps;
}

async function serviceEditTp(type, agreed_total,is_completed, tpId) {
    if (type === undefined && agreed_total === undefined && is_completed === undefined) {
        throw appError('NOTHING_TO_UPDATE', "Nothing to update", 400);
    }

    let status;
    if(is_completed === true){
       status = "completed";
    } else{
     status = "active";
    }
    const fields = {};
    if (type !== undefined) fields.type = type;
    if (agreed_total !== undefined) fields.agreed_total = agreed_total;
    if (is_completed !== undefined) fields.is_completed = is_completed;
    if (status !== undefined) fields.status = status;

    const result = await treatmentPlanModel.editTp(tpId, fields);
    return result;
}

async function serviceDeleteTp(tpId) {

  const deletedTp = await treatmentPlanModel.deleteTp(tpId);
  if (!deletedTp) throw appError('DELETE_TP_FAILED', 'tp failed to delete', 404);

  return deletedTp;
}

async function serviceUpdatePaidForTpSession(tpId, sessionId, amount) {
  const result = await treatmentPlanModel.updatePaidForTpSession(
    tpId,
    sessionId,
    amount
  );

  if (!result) {
    throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);
  }

  return result;
}


export default {
    serviceGetActivePlan, serviceGetSessionsForTp, serviceGetAllTreatmentPlansForSection,
    serviceEditTp, serviceDeleteTp, serviceUpdatePaidForTpSession
}