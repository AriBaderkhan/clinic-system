import treatmentPlanModel from '../models/treatmentPlanModel.js';
import appError from '../utils/appError.js';

async function getActive(patientId, type, tenant_id, branch_id) {
  // returns ALL active plans of this type (a patient can have several at once)
  const plans = await treatmentPlanModel.getActivePlans(patientId, type, tenant_id, branch_id);
  return plans;
}


async function getSessions(tpId, tenant_id, branch_id) {

  const sessionsForTp = await treatmentPlanModel.getSessionsForTp(tpId, tenant_id, branch_id);

  return sessionsForTp;
}

async function getAll({ isPaid, isCompleted, search, page, limit }, tenant_id, branch_id) {
  const result = await treatmentPlanModel.getAllTreatmentPlansForSection({ isPaid, isCompleted, search, page, limit }, tenant_id, branch_id);
  return result;
}

async function update(type, agreed_total, is_completed, tpId, tenant_id, branch_id) {
  if (type === undefined && agreed_total === undefined && is_completed === undefined) {
    throw appError('NOTHING_TO_UPDATE', "Nothing to update", 400);
  }

  let status;
  if (is_completed === true) {
    status = "completed";
  } else {
    status = "active";
  }
  const fields = {};
  if (type !== undefined) fields.type = type;
  if (agreed_total !== undefined) fields.agreed_total = agreed_total;
  if (is_completed !== undefined) fields.is_completed = is_completed;
  if (status !== undefined) fields.status = status;

  const result = await treatmentPlanModel.editTp(tpId, fields, tenant_id, branch_id);
  return result;
}

async function _delete(tpId, tenant_id, branch_id) {
  try {
    const deletedTp = await treatmentPlanModel.deleteTp(tpId, tenant_id, branch_id);
    if (!deletedTp) throw appError('DELETE_TP_FAILED', 'tp failed to delete', 404);
    return deletedTp;
  } catch (err) {
    if (err.code === '23503') {
      throw appError('TP_HAS_RECORDS', 'Cannot delete this treatment plan. It has existing sessions or payments.', 409);
    }
    throw err;
  }
}

async function updatePaidSession(tpId, sessionId, amount, tenant_id, branch_id) {
  const result = await treatmentPlanModel.updatePaidForTpSession(
    tpId,
    sessionId,
    amount,
    tenant_id,
    branch_id
  );

  if (!result) {
    throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);
  }

  return result;
}


export default {
  getActive, getSessions, getAll, update, delete: _delete, updatePaidSession
}