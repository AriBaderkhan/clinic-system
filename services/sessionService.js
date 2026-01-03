import appError from '../utils/appError.js';

import pool from '../db_connection.js';
import sessionModel from '../models/sessionModel.js';
import sessionPaymentModel from '../models/sessionPaymentModel.js';
import appoinmentModel from '../models/appoinmentModel.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import treatmentPlanPaymentModel from '../models/treatmentPlanPaymentModel.js';


async function serviceCreateSession(sessionData) {
  const { appointment_id, next_plan, notes, created_by } = sessionData;

  const appointment = await appoinmentModel.getPatientAndDoctorByAppointmentId(appointment_id);
  if (!appointment) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found',404);
  if (!['completed', 'in_progress'].includes(appointment.status)) throw appError('INVALID_APPOINTMENT_STATUS', 'Only completed or in_progress appointments can have sessions',400);

  const createdSession = await sessionModel.createSession(appointment_id, next_plan, notes, created_by);

  return createdSession;
}

async function serviceGetAllSessions() {
  const sessions = await sessionModel.getAllSessions();
  if (sessions.length === 0) throw appError('FETCH_SESSIONS_FAILED', 'No sessions found',404);
  return sessions;
}

async function serviceGetSession(session_id) {

  const session = await sessionModel.getSession(session_id);
  if (!session) throw appError('FETCH_SESSION_FAILED', 'Session not found',404);
  return session;
}

async function serviceUpdateSession(sessionID, fields, updatedBy) {

  const session = await sessionModel.getSession(sessionID)
  if (!session) throw appError('FETCH_SESSION_FAILED', 'Session not found',404);
  const updatedSession = await sessionModel.updateSession(sessionID, fields, updatedBy);
  if (!updatedSession) throw appError('UPDATE_SESSION_FAILED', 'Failed to update session',500);
  return updatedSession;

}

async function serviceDeleteSession(sessionID) {

  const deletedsession = await sessionModel.deleteSession(sessionID);
  if (!deletedsession) throw appError('DELETE_SESSION_FAILED', 'session failed to delete',500);

  return deletedsession;
}

async function serviceGetAllUnPaidSessions() {
  // STEP 1: base unpaid sessions
  const baseSessions = await sessionModel.getAllUnPaidSessions();
  if (baseSessions.length === 0) return [];

  const sessionIds = baseSessions.map(s => s.session_id);

  // STEP 2: works
  const worksRows = await sessionModel.getWorksForSessions(sessionIds);

  const worksBySession = {};
  for (const row of worksRows) {
    const sid = row.session_id;

    if (!worksBySession[sid]) {
      worksBySession[sid] = { items_count: 0, _groups: {} };
    }

    const key = `${row.work_id}-${row.unit_price}`;
    if (!worksBySession[sid]._groups[key]) {
      worksBySession[sid]._groups[key] = {
        work_name: row.work_name,
        quantity: 0,
        total_price: 0,
        teeth: [],
      };
    }

    const g = worksBySession[sid]._groups[key];
    g.quantity += row.quantity;
    g.total_price += Number(row.total_price);
    if (row.tooth_number != null) g.teeth.push(row.tooth_number);

    worksBySession[sid].items_count += 1;
  }

  for (const sid of Object.keys(worksBySession)) {
    worksBySession[sid].works = Object.values(worksBySession[sid]._groups);
    delete worksBySession[sid]._groups;
  }

  // STEP 3: 🔥 FETCH TREATMENT PLANS (THIS WAS MISSING)
  const planRows = await sessionModel.getTreatmentPlansForSessions(sessionIds);

  const plansBySession = {};
  for (const row of planRows) {
    if (!plansBySession[row.session_id]) {
      plansBySession[row.session_id] = [];
    }

    plansBySession[row.session_id].push({
      id: row.id,
      type: row.type,
      agreed_total: Number(row.agreed_total),
      total_paid: Number(row.total_paid || 0),
      is_paid: row.is_paid,
      is_completed: row.is_completed,
      status: row.status,
    });
  }

  // STEP 4: build final response
  return baseSessions.map(s => {
    const ws = worksBySession[s.session_id] || { items_count: 0, works: [] };

    // console.log("selectedForPayment", s);
    console.log("treatment_planssssssssssssssssssssssss", s?.treatment_plans);

    return {
      session_id: s.session_id,
      appointment_id: s.appointment_id,

      patient: {
        id: s.patient_id,
        full_name: s.patient_name,
        phone: s.patient_phone,
      },

      doctor: {
        id: s.doctor_id,
        full_name: s.doctor_name,
      },

      appointment: {
        start_time: s.appointment_start_time,
        end_time: s.appointment_end_time,
        status: s.appointment_status,
      },

      totals: {
        min_total: Number(s.min_total),
        total: Number(s.total),
        total_paid: Number(s.total_paid || 0),
        remaining: Number(s.total) - Number(s.total_paid || 0),
      },

      plan: {
        next_plan: s.next_plan,
        notes: s.notes,
      },

      works_summary: ws,

      // ✅ THIS UNBLOCKS YOUR FRONTEND
      treatment_plans: plansBySession[s.session_id] || [],
    };
  });
}


// SERVICE: Pay session
async function servicePaySession({ sessionId, normalAmount, planPayments, note, userId }) {
  const client = await pool.connect();
  console.log('connect 1 ')

  try {
    await client.query("BEGIN");
    console.log('begin 2 ')

    // ✅ lock session row (prevents double-pay race)
    const session = await sessionModel.getSessionWithAppointmentForUpdate(sessionId, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found",404);
    console.log('load session 3')

    if (session.appointment_status !== "completed") {
      throw appError("APPOINTMENT_NOT_COMPLETED", "Appointment is not completed",400);
    }

const total = Number(session.total) || 0;
const totalPaid = Number(session.total_paid) || 0;

const payNormal =
  normalAmount !== null &&
  normalAmount !== "" &&
  Number(normalAmount) > 0;

const payPlans =
  Array.isArray(planPayments) && planPayments.length > 0;

// what is actually due
const sessionDue = total > totalPaid;
const planDue = await sessionModel.hasPlanDue(sessionId, client);

// ❗ RULE: allow empty ONLY if nothing is due
if (!payNormal && !payPlans) {
  if (sessionDue || planDue) {
    throw appError(
      "NO_PAYMENT_PROVIDED",
      "No payment amount specified",
      400
    );
  }

  // ✅ nothing due → valid request → just exit
  return { ok: true, message: "Nothing due for this session" };
}

    // -------------------------
    // 1) NORMAL SESSION PAYMENT
    // -------------------------
    if (payNormal) {
      if (session.is_paid) {
        throw appError("SESSION_ALREADY_PAID", "This session is already paid",400);
      }

      const numericAmount = Number(normalAmount);
      if (!numericAmount || numericAmount <= 0) {
        throw appError("INVALID_PAYMENT_AMOUNT", "Invalid amount",400);
      }

      // RULE: cannot pay below min_total (unchanged)
      if (numericAmount < Number(session.min_total)) {
        throw appError("AMOUNT_BELOW_MIN", "Amount cannot be less than minimum total",400);
      }


      await sessionPaymentModel.createSessionPayment(
        {
          sessionId,
          amount: numericAmount,
          note,
          createdBy: userId,
        },
        client
      );
      console.log('create session payment 4 ') // it stops here 

      await sessionPaymentModel.recalcSessionTotals(sessionId, client);
      console.log('5 recale')
    }

    // -------------------------
    // 2) TREATMENT PLAN PAYMENTS
    // -------------------------
    let updatedPlans = [];

    if (payPlans) {
      const plansInSession = await sessionModel.getTreatmentPlansForSession(sessionId, client);
      const allowedPlanIds = new Set(plansInSession.map((tp) => Number(tp.id)));

      console.log('get treatmentplan for this session 6')
      for (const detail of planPayments) {
        const plan_id = Number(detail.plan_id);
        const amount = Number(detail.amount);

        if (!plan_id || !Number.isFinite(plan_id)) {
          throw appError("INVALID_PLAN_ID", `Invalid treatment plan ID: ${detail.plan_id}`,400);
        }

        if (!allowedPlanIds.has(plan_id)) {
          throw appError(
            "PLAN_NOT_IN_SESSION",
            `Treatment plan ID ${plan_id} is not associated with session ${sessionId}`,
            400
          );
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          throw appError("INVALID_PLAN_AMOUNT", `Invalid amount for treatment plan ID ${plan_id}`,400);
        }

        // ✅ lock plan row (prevents race overpay on same plan)
        const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(plan_id, client);
        console.log('get treatment plan for update')
        if (!plan) {
          throw appError("PLAN_NOT_FOUND", `Treatment plan ID ${plan_id} not found`,404);
        }

        // if (plan.status !== "active") {
        //   throw appError("PLAN_NOT_ACTIVE", `Treatment plan ID ${plan_id} is not active`);
        // }

        // RULE: plan must belong to same patient
        if (Number(plan.patient_id) !== Number(session.patient_id)) {
          throw appError(
            "PLAN_PATIENT_MISMATCH",
            `Treatment plan ID ${plan_id} does not belong to the same patient as session ${sessionId}`,
            400
          );
        }

        // RULE: cannot exceed remaining (unchanged from your latest)
        const remainingAmount = Number(plan.agreed_total) - Number(plan.total_paid);
        if (amount > remainingAmount) {
          throw appError(
            "AMOUNT_EXCEEDS_REMAINING",
            `Amount for treatment plan ID ${plan_id} exceeds remaining balance of ${remainingAmount}`,400
          );
        }


        // RULE: min installment from work_catalog (unchanged)
        const code = String(plan.type || "").toUpperCase(); // ORTHO/IMPLANT/RCT
        console.log(code)
        const catalog = await workCatalogModel.getWorkByType(code, client);
        console.log('get work 7')
        if (!catalog) {
          throw appError(
            "WORK_CATALOG_NOT_FOUND",
            `Work catalog entry not found for code ${code}`,
            404
          );
        }

        const minInstallment = Number(catalog.min_installment_amount) || 0;
        if (amount < minInstallment && remainingAmount > minInstallment) {
          throw appError(
            "AMOUNT_BELOW_MIN_INSTALLMENT",
            `Amount for treatment plan ID ${plan_id} cannot be less than minimum installment amount of ${minInstallment}`,400
          );
        }

        await treatmentPlanPaymentModel.createTreatmentPlanPayment(
          {
            treatmentPlanId: plan_id,
            sessionId,
            amount,
            note,
            createdBy: userId,
          },
          client
        );

        console.log('create treamtent pyemnt 8')
        const updatedPlan = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(plan_id, client);
        console.log('clg 9 recalegh')
        updatedPlans.push(updatedPlan);
      }
    }

    // refresh session after recalcs
    const sessionAfter = await sessionModel.getSessionPaymentContext(sessionId, client);

    console.log('refresh 10 ')
    await client.query("COMMIT");
    console.log('commit')

    return {
      session: {
        session_id: sessionAfter.session_id,
        totals: {
          min_total: Number(sessionAfter.min_total),
          total: Number(sessionAfter.total),
          total_paid: Number(sessionAfter.total_paid),
          is_paid: sessionAfter.is_paid,
        },
      },
      treatment_plans: updatedPlans.map((p) => ({
        id: p.id,
        type: p.type,
        agreed_total: Number(p.agreed_total),
        total_paid: Number(p.total_paid),
        is_paid: p.is_paid,
        is_completed: p.is_completed,
        status: p.status,
      })),

    };
    console.log('retuurn')


  } catch (error) {
    await client.query("ROLLBACK");
    console.log(error, "roolback")
    throw error;
  } finally {
    client.release();
    console.log('release done ')
  }
}


export default {
  serviceCreateSession, serviceGetAllSessions, serviceGetSession, serviceUpdateSession, serviceDeleteSession, serviceGetAllUnPaidSessions,
  servicePaySession
}