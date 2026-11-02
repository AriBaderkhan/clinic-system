import pool from '../db_connection.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import { ownId } from '../utils/scope.js';
import treatmentPlanPaymentModel from '../models/treatmentPlanPaymentModel.js';
import sessionModel from '../models/sessionModel.js';
import appError from '../utils/appError.js';
import cents from '../utils/money.js';

async function getActive(patientId, type, tenant_id, branch_id) {
  // returns ALL active plans of this type (a patient can have several at once)
  const plans = await treatmentPlanModel.getActivePlans(patientId, type, tenant_id, branch_id);
  return plans;
}


async function getSessions(tpId, tenant_id, branch_id) {

  const sessionsForTp = await treatmentPlanModel.getSessionsForTp(tpId, tenant_id, branch_id);

  return sessionsForTp;
}

async function getAll({ isPaid, isCompleted, search, page, limit, viewer }, tenant_id, branch_id) {
  // "own only" patients -> only the plans of the user's own patients
  const own_id = ownId(viewer, 'view_patient');
  const result = await treatmentPlanModel.getAllTreatmentPlansForSection({ isPaid, isCompleted, search, page, limit, own_id }, tenant_id, branch_id);
  return result;
}

async function update(type, agreed_total, is_completed, tpId, tenant_id, branch_id) {
  if (type === undefined && agreed_total === undefined && is_completed === undefined) {
    throw appError('NOTHING_TO_UPDATE', "Nothing to update", 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(tpId, tenant_id, branch_id, client);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Treatment plan not found', 404);

    // the agreement can never be lower than what the patient already paid
    if (agreed_total !== undefined && cents(agreed_total) < cents(plan.total_paid)) {
      throw appError('AGREED_BELOW_PAID', `Agreed total cannot be less than the amount already paid (${Number(plan.total_paid)})`, 400);
    }

    // status follows is_completed only when the caller actually sent it
    let status;
    if (is_completed === true) status = 'completed';
    if (is_completed === false) status = 'active';

    const result = await treatmentPlanModel.editTp(tpId, {
      type: type !== undefined ? String(type).toLowerCase() : undefined,
      agreed_total, is_completed, status,
    }, tenant_id, branch_id, client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function _delete(tpId, deletedBy, tenant_id, branch_id) {
  // Void (soft-delete): flags the plan + its works + its payments as deleted.
  // No FK block anymore — a plan WITH works/payments is exactly the case we void.
  const voidedTp = await treatmentPlanModel.voidTp(tpId, deletedBy, tenant_id, branch_id);
  if (!voidedTp) throw appError('PLAN_NOT_FOUND', 'Treatment plan not found or already deleted', 404);
  return voidedTp;
}

// Set "paid for this plan in this visit" to an amount (0 removes it). Works on the
// single live payment row of that plan+visit; if a visit has several plan payments
// they must be edited one by one in the session editor (never merged/multiplied).
async function updatePaidSession(tpId, sessionId, amount, userId, tenant_id, branch_id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const session = await sessionModel.lockLiveSession(sessionId, tenant_id, branch_id, client);
    if (!session) throw appError('SESSION_NOT_FOUND', 'Session not found', 404);

    const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(tpId, tenant_id, branch_id, client);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Treatment plan not found', 404);
    if (Number(plan.patient_id) !== Number(session.patient_id)) {
      throw appError('PLAN_PATIENT_MISMATCH', 'Treatment plan does not belong to this patient', 400);
    }
    const linked = await sessionModel.countLivePlanWorksInSession(sessionId, tpId, tenant_id, branch_id, client);
    if (linked === 0) throw appError('PLAN_NOT_IN_SESSION', 'This plan has no work in this visit', 400);

    const rows = await treatmentPlanPaymentModel.getLiveForPlanInSessionForUpdate(sessionId, tpId, tenant_id, branch_id, client);
    if (rows.length > 1) {
      throw appError('PLAN_PAYMENTS_MULTIPLE', 'This visit has several payments for this plan — edit them one by one in the session editor', 409);
    }

    const value = Number(amount);
    let payment = rows[0] || null;
    if (value === 0) {
      if (payment) payment = await treatmentPlanPaymentModel.voidPayment(payment.id, userId, tenant_id, branch_id, client);
    } else if (payment) {
      payment = await treatmentPlanPaymentModel.updatePayment(payment.id, value, payment.note, tenant_id, branch_id, client);
    } else {
      payment = await treatmentPlanPaymentModel.createTreatmentPlanPayment(
        { treatmentPlanId: tpId, sessionId, amount: value, note: null, createdBy: userId }, tenant_id, branch_id, client);
    }

    const updatedPlan = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(tpId, tenant_id, branch_id, client);
    if (cents(updatedPlan.total_paid) > cents(updatedPlan.agreed_total)) {
      throw appError('AMOUNT_EXCEEDS_REMAINING', `Amount exceeds the plan's agreed total of ${Number(updatedPlan.agreed_total)}`, 400);
    }

    await client.query('COMMIT');
    return { payment, tp_total_paid: Number(updatedPlan.total_paid) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


export default {
  getActive, getSessions, getAll, update, delete: _delete, updatePaidSession
}
