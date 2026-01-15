import appError from '../utils/appError.js';

import pool from '../db_connection.js';
import sessionModel from '../models/sessionModel.js';
import sessionPaymentModel from '../models/sessionPaymentModel.js';
import appoinmentModel from '../models/appoinmentModel.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import treatmentPlanPaymentModel from '../models/treatmentPlanPaymentModel.js';
import dateRange from '../utils/dateRange.js';

function buildWorksSummary(worksRows) {
  if (!worksRows || worksRows.length === 0) {
    return {
      items_count: 0,
      works: [],
    };
  }

  const groups = {}; // key: work_id-unit_price

  for (const row of worksRows) {
    const key = `${row.work_id}-${row.unit_price}`;

    if (!groups[key]) {
      groups[key] = {
        work_name: row.work_name,
        quantity: 0,
        total_price: 0,
        teeth: [],
      };
    }

    const g = groups[key];

    g.quantity += row.quantity;                    // sum quantity
    g.total_price += Number(row.total_price);      // sum price

    if (row.tooth_number !== null && row.tooth_number !== undefined) {
      g.teeth.push(row.tooth_number);              // collect teeth
    }
  }

  return {
    items_count: worksRows.length,                 // raw rows count
    works: Object.values(groups),                  // array of grouped items
  };

}
async function serviceCreateSession(sessionData) {
  const { appointment_id, next_plan, notes, created_by } = sessionData;

  const appointment = await appoinmentModel.getPatientAndDoctorByAppointmentId(appointment_id);
  if (!appointment) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
  if (!['completed', 'in_progress'].includes(appointment.status)) throw appError('INVALID_APPOINTMENT_STATUS', 'Only completed or in_progress appointments can have sessions', 400);

  const createdSession = await sessionModel.createSession(appointment_id, next_plan, notes, created_by);

  return createdSession;
}

async function serviceGetAllSessions({ day,  search }) {

  const range = day ? dateRange.getDateRange(day) : null;
  
  // here is the problem for all session it will include only normal sessions below
  const base = await sessionModel.getAllNormalSessions({  
        from: range ? range.from : null,
        to: range ? range.to : null,
        search: search,
    });
  if (base.length === 0) return []
  //   const sessionIds = base.map(s => s.session_id);

  // const worksRows = await sessionModel.getWorksForSessions(sessionIds);
  // const worksBySession = {};
  // for (const row of worksRows) {
  //   if (!worksBySession[row.session_id]) worksBySession[row.session_id] = [];
  //   worksBySession[row.session_id].push(row);
  // }

  //  return base.map((s) => {
  //   const worksSummary = buildWorksSummary(worksBySession[s.session_id] || []);

  //   return {
  //     session: {
  //       session_id: s.session_id,
  //       appointment_id: s.appointment_id,

  //       totals: {
  //         min_total: Number(s.min_total),
  //         total: Number(s.total),
  //         total_paid: Number(s.total_paid || 0),
  //         is_paid: s.is_paid,
  //       },

  //       plan: {
  //         next_plan: s.next_plan,
  //         notes: s.notes,
  //       },

  //       meta: {
  //         created_at: s.created_at,
  //       },

  //       appointment: {
  //         start_time: s.appointment_start_time,
  //         end_time: s.appointment_end_time,
  //         status: s.appointment_status,
  //       },

  //       patient: {
  //         id: s.patient_id,
  //         full_name: s.patient_name,
  //         phone: s.patient_phone,
  //       },

  //       doctor: {
  //         id: s.doctor_id,
  //         full_name: s.doctor_name,
  //       },

  //       processed_by: s.processed_by || null,
  //     },

  //     works_summary: worksSummary,
  //   };
  // });
  return base
}

async function serviceGetNormalSession(session_id) {

  const base = await sessionModel.getNormalSession(session_id);
  if (!base) throw appError("SESSION_NOT_FOUND", "session not found", 404);



  const worksRows = await sessionModel.getWorksForNormalSession(session_id);
  const worksSummary = buildWorksSummary(worksRows);


  return {
    session: {
      session_id: base.session_id,
      appointment_id: base.appointment_id,

      totals: {
        min_total: Number(base.min_total),
        total: Number(base.total),
        total_paid: Number(base.total_paid || 0),
        is_paid: base.is_paid,
      },

      plan: {
        next_plan: base.next_plan,
        notes: base.notes,
      },

      meta: {
        created_at: base.created_at,
      },

      appointment: {
        start_time: base.appointment_start_time,
        end_time: base.appointment_end_time,
        status: base.appointment_status,
      },

      patient: {
        id: base.patient_id,
        full_name: base.patient_name,
        phone: base.patient_phone,
      },

      doctor: {
        id: base.doctor_id,
        full_name: base.doctor_name,
      },

      processed_by: base.processed_by || null,
    },

    sw_id: base.sw,
    works_summary: worksSummary, // <-- Filling 3x, Scaling 2x, etc.

  };
}
async function serviceGetSession(session_id) {

  const session = await sessionModel.getSession(session_id);
  if (!session) throw appError('FETCH_SESSION_FAILED', 'Session not found', 404);
  return session;
}

async function serviceEditNormalSession(session_id, fields) {
  const client = await pool.connect();

  const { notes, next_plan, works, total_paid } = fields;

  try {
    await client.query("BEGIN");

    // 1) base session
    const base = await sessionModel.getNormalSession(session_id, client);
    if (!base) throw appError("SESSION_NOT_FOUND", "session not found", 404);

    // Keep current paid if user didn't send total_paid
    const currentPaid = Number(base.total_paid) || 0;

    // 2) update works (ONLY normal works)
    let normalMinTotal = Number(base.min_total) || 0;
    let normalGrandTotal = Number(base.total) || 0;

    if (works) {
      if (!Array.isArray(works) || works.length === 0) {
        throw appError("WORKS_REQUIRED", "works must be a non-empty array", 400);
      }

      // delete old normal works
      await sessionModel.deleteSessionWorksBySiD(session_id, client);

      // recalc from scratch
      normalMinTotal = 0;
      normalGrandTotal = 0;

      for (const w of works) {
        const { work_id, quantity, tooth_number } = w;

        const catalog = await workCatalogModel.getWorkById(work_id, client);
        if (!catalog) throw appError("WORK_NOT_FOUND", "Work not found", 404);

        const minUnit = Number(catalog.min_price) || 0;
        const unit = minUnit; // for now

        const qty = Number(quantity) || 1;

        const rowMin = minUnit * qty;
        const rowTotal = unit * qty;

        await sessionModel.createSessionWork(
          {
            sessionId: session_id,
            workId: work_id,
            quantity: qty,
            toothNumber: tooth_number ?? null,
            minUnitPrice: minUnit,
            unitPrice: unit,
            totalMinPrice: rowMin,
            totalPrice: rowTotal,
            treatmentPlanId: null, // ✅ normal only
          },
          client
        );

        normalMinTotal += rowMin;
        normalGrandTotal += rowTotal;
      }
    }

    // 3) decide paid
    let finalPaid = currentPaid;
    if (total_paid !== undefined && total_paid !== null && total_paid !== "") {
      finalPaid = Number(total_paid);
      if (Number.isNaN(finalPaid) || finalPaid < 0) {
        throw appError("INVALID_TOTAL_PAID", "total_paid must be number >= 0", 400);
      }
    }

    const is_paid = finalPaid >= 0;

    // 4) update session totals + paid + paid flag
    const updatedTotals = await sessionModel.updateSessionTotal(
      {
        min_total: normalMinTotal,
        total: normalGrandTotal,
        total_paid: finalPaid,
        is_paid,
        sessionId: session_id,
      },
      client
    );
    if (!updatedTotals) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);

    // 5) update notes / next_plan (only if provided)
    // (use your existing model method, or add one simple update query in model)
    if (notes !== undefined || next_plan !== undefined) {
      const notess = { notes, next_plan }
      const updatedPlan = await sessionModel.updateSessionNotesFields(session_id, notess, client);
      if (!updatedPlan) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);
    }

    await client.query("COMMIT");

    // return fresh details (optional)
    const after = await sessionModel.getNormalSession(session_id, client);
    return after;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


async function serviceDeleteSession(sessionID) {

  const deletedsession = await sessionModel.deleteSession(sessionID);
  if (!deletedsession) throw appError('DELETE_SESSION_FAILED', 'session failed to delete', 500);

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
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);
    console.log('load session 3')

    if (session.appointment_status !== "completed") {
      throw appError("APPOINTMENT_NOT_COMPLETED", "Appointment is not completed", 400);
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
        throw appError("SESSION_ALREADY_PAID", "This session is already paid", 400);
      }

      const numericAmount = Number(normalAmount);
      if (!numericAmount || numericAmount <= 0) {
        throw appError("INVALID_PAYMENT_AMOUNT", "Invalid amount", 400);
      }

      // RULE: cannot pay below min_total (unchanged)
      // if (numericAmount < Number(session.min_total)) {
      //   throw appError("AMOUNT_BELOW_MIN", "Amount cannot be less than minimum total", 400);
      // }


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
          throw appError("INVALID_PLAN_ID", `Invalid treatment plan ID: ${detail.plan_id}`, 400);
        }

        if (!allowedPlanIds.has(plan_id)) {
          throw appError(
            "PLAN_NOT_IN_SESSION",
            `Treatment plan ID ${plan_id} is not associated with session ${sessionId}`,
            400
          );
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          throw appError("INVALID_PLAN_AMOUNT", `Invalid amount for treatment plan ID ${plan_id}`, 400);
        }

        // ✅ lock plan row (prevents race overpay on same plan)
        const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(plan_id, client);
        console.log('get treatment plan for update')
        if (!plan) {
          throw appError("PLAN_NOT_FOUND", `Treatment plan ID ${plan_id} not found`, 404);
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
            `Amount for treatment plan ID ${plan_id} exceeds remaining balance of ${remainingAmount}`, 400
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
        // if (amount < minInstallment && remainingAmount > minInstallment) {
        //   throw appError(
        //     "AMOUNT_BELOW_MIN_INSTALLMENT",
        //     `Amount for treatment plan ID ${plan_id} cannot be less than minimum installment amount of ${minInstallment}`, 400
        //   );
        // }

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
  serviceCreateSession, serviceGetAllSessions, serviceGetNormalSession, serviceGetSession, serviceEditNormalSession, serviceDeleteSession, serviceGetAllUnPaidSessions,
  servicePaySession
}