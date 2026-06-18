import appError from '../utils/appError.js';

import pool from '../db_connection.js';
import sessionModel from '../models/sessionModel.js';
import sessionPaymentModel from '../models/sessionPaymentModel.js';
import appointmentModel from '../models/appointmentModel.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import treatmentPlanPaymentModel from '../models/treatmentPlanPaymentModel.js';
import dateRange from '../utils/dateRange.js';
import settingModel from '../models/settingModel.js';

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
        work_id: row.work_id,                      // keep the id so the UI never matches by name
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

// Treatment-plan works as INDIVIDUAL rows (one per tooth) for the editor.
// Each carries its session_work_id so the tooth can be edited in place. The
// plan itself (money/type) is never touched here.
function buildPlanWorks(rows) {
  return rows.map((row) => ({
    session_work_id: row.session_work_id,
    work_id: row.work_id,
    work_name: row.work_name,
    plan_type: row.plan_type || null,
    treatment_plan_id: row.treatment_plan_id,
    tooth_number: row.tooth_number,
    quantity: row.quantity,
  }));
}

async function getAll({ day, search, page, limit }, tenant_id, branch_id) {
  const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id);
  const range = day ? dateRange.getDateRange(day, settings?.timezone) : null;
  const result = await sessionModel.getAllNormalSessions({
    from: range ? range.from : null,
    to: range ? range.to : null,
    search,
    page,
    limit,
  }, tenant_id, branch_id);
  return result;
}

async function getNormal(session_id, tenant_id, branch_id) {

  const [base, allWorks] = await Promise.all([
    sessionModel.getNormalSession(session_id, tenant_id, branch_id),
    sessionModel.getAllWorksForSession(session_id, tenant_id, branch_id), // normal + plan, with work_id
  ]);
  if (!base) throw appError("SESSION_NOT_FOUND", "session not found", 404);

  const normalRows = allWorks.filter((r) => r.treatment_plan_id == null);
  const planRows = allWorks.filter((r) => r.treatment_plan_id != null);

  const worksSummary = buildWorksSummary(normalRows); // editable normal works
  const planWorks = buildPlanWorks(planRows);          // read-only plan works


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
    works_summary: worksSummary, // <-- Filling 3x, Scaling 2x, etc. (editable normal works)
    plan_works: planWorks,       // <-- treatment-plan works, read-only display

  };
}

async function editNormal(session_id, fields, userId, tenant_id, branch_id) {
  const client = await pool.connect();

  const { notes, next_plan, works, total_paid } = fields;

  try {
    await client.query("BEGIN");

    // 1) base session
    const base = await sessionModel.getNormalSession(session_id, tenant_id, branch_id, client);
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
      await sessionModel.deleteSessionWorksBySiD(session_id, tenant_id, branch_id, client);

      // recalc from scratch
      normalMinTotal = 0;
      normalGrandTotal = 0;

      const workIds = works.map(w => w.work_id);
      const catalogRows = await workCatalogModel.getWorksByIds(workIds, tenant_id, branch_id, client);
      const catalogMap = Object.fromEntries(catalogRows.map(c => [c.id, c]));

      const PLAN_CODES = ['ortho', 'implant', 'rct', 're_rct'];
      const workItems = [];
      for (const w of works) {
        const { work_id, quantity, tooth_number } = w;

        const catalog = catalogMap[work_id];
        if (!catalog) throw appError("WORK_NOT_FOUND", "Work not found", 404);

        const code = String(catalog.code || "").toLowerCase();
        const minUnit = Number(catalog.min_price) || 0;
        const unit = minUnit;
        const qty = Number(quantity) || 1;
        const rowMin = minUnit * qty;
        const rowTotal = unit * qty;

        // Treatment-plan works added during an edit: CONTINUE an existing active
        // plan (treatment_plan_id) or start a NEW one with its agreement total.
        let treatmentPlanId = null;
        if (PLAN_CODES.includes(code)) {
          if (w.treatment_plan_id) {
            const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(Number(w.treatment_plan_id), tenant_id, branch_id, client);
            if (!plan) throw appError('PLAN_NOT_FOUND', `Treatment plan ${w.treatment_plan_id} not found`, 404);
            if (Number(plan.patient_id) !== Number(base.patient_id)) throw appError('PLAN_PATIENT_MISMATCH', 'Treatment plan does not belong to this patient', 400);
            if (String(plan.type) !== code) throw appError('PLAN_TYPE_MISMATCH', `Selected plan is not a ${code} plan`, 400);
            if (plan.status !== 'active') throw appError('PLAN_NOT_ACTIVE', 'Selected treatment plan is not active', 400);
            treatmentPlanId = plan.id;
          } else {
            const agreedTotal = Number(w.agreed_total);
            if (!agreedTotal || agreedTotal <= 0) throw appError('AGREEMENT_TOTAL_REQUIRED', `${code} agreement total required`, 400);
            if (agreedTotal < minUnit) throw appError('AGREEMENT_TOTAL_BELOW_MIN', `${code} agreement must be >= ${minUnit}`, 400);
            const plan = await treatmentPlanModel.createPlan({
              patientId: base.patient_id,
              type: code,
              agreedTotal,
              createdBy: userId,
            }, tenant_id, branch_id, client);
            treatmentPlanId = plan.id;
          }
        }

        workItems.push({
          sessionId: session_id,
          workId: work_id,
          quantity: qty,
          toothNumber: tooth_number ?? null,
          minUnitPrice: minUnit,
          unitPrice: unit,
          totalMinPrice: rowMin,
          totalPrice: rowTotal,
          treatmentPlanId,
        });

        // plan works don't count toward the session (normal) total
        if (treatmentPlanId === null) {
          normalMinTotal += rowMin;
          normalGrandTotal += rowTotal;
        }
      }
      await sessionModel.bulkCreateSessionWorks(workItems, tenant_id, branch_id, client);
    }

    let sessionsAfterRecalc = null;
    // 3) decide paid
    let finalPaid = currentPaid;
    if (total_paid !== undefined && total_paid !== null && total_paid !== "") {
      finalPaid = Number(total_paid);
      if (Number.isNaN(finalPaid) || finalPaid < 0) {
        throw appError("INVALID_TOTAL_PAID", "total_paid must be number >= 0", 400);
      }
    }

    // const is_paid = finalPaid >= 0;

    // // 4) update session totals + paid + paid flag
    // const updatedTotals = await sessionModel.updateSessionTotal(
    //   {
    //     min_total: normalMinTotal,
    //     total: normalGrandTotal,
    //     total_paid: finalPaid,
    //     is_paid,
    //     sessionId: session_id,
    //   },
    //   client
    // );
    // if (!updatedTotals) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);

    // âœ… update amount in session_payments (via model)
    // session_payments.amount has a CHECK (amount > 0); only record a payment
    // when money was actually paid. A zero/unpaid session keeps no payment row.
    if (finalPaid > 0) {
      const updatedPayment = await sessionPaymentModel.upsertSessionPaymentBySessionId({
        sessionId: session_id,
        amount: finalPaid,
        createdBy: userId,

      }, tenant_id, branch_id, client
      );
      if (!updatedPayment) {
        throw appError("PAYMENT_UPDATE_FAILED", "session payment not found for this session", 404);
      }
    }

    // âœ… recalc -> updates sessions.total_paid and sessions.is_paid correctly
    sessionsAfterRecalc = await sessionPaymentModel.recalcSessionTotals(session_id, tenant_id, branch_id, client);
    if (!sessionsAfterRecalc) {
      throw appError("SESSION_RECALC_FAILED", "failed to recalc session totals", 500);
    }


    // 4) update session totals (min_total/total) + keep paid from recalc if it happened
    const paidToSave =
      sessionsAfterRecalc?.total_paid !== undefined
        ? Number(sessionsAfterRecalc.total_paid || 0)
        : Number(base.total_paid || 0);

    const isPaidToSave =
      sessionsAfterRecalc?.is_paid !== undefined ? sessionsAfterRecalc.is_paid : base.is_paid;

    const updatedTotals = await sessionModel.updateSessionTotal(
      {
        min_total: normalMinTotal,
        total: normalGrandTotal,
        total_paid: paidToSave,
        is_paid: isPaidToSave,
        sessionId: session_id,
      },
      tenant_id, branch_id, client
    );
    if (!updatedTotals) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);

    // 5) update notes / next_plan (only if provided)
    // (use your existing model method, or add one simple update query in model)
    if (notes !== undefined || next_plan !== undefined) {
      const notess = { notes, next_plan }
      const updatedPlan = await sessionModel.updateSessionNotesFields(session_id, notess, tenant_id, branch_id, client);
      if (!updatedPlan) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);
    }

    await client.query("COMMIT");

    return {
      ...base,
      min_total: updatedTotals.min_total,
      total: updatedTotals.total,
      total_paid: updatedTotals.total_paid,
      is_paid: updatedTotals.is_paid,
      notes: notes !== undefined ? notes : base.notes,
      next_plan: next_plan !== undefined ? next_plan : base.next_plan,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


// Update ONLY the tooth of treatment-plan works in a session. No money, no plan
// changes. updates = [{ session_work_id, tooth_number }].
async function updatePlanWorkTeeth(session_id, updates, tenant_id, branch_id) {
  if (!Array.isArray(updates) || updates.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = [];
    for (const u of updates) {
      const id = Number(u.session_work_id ?? u.id);
      if (!Number.isFinite(id)) throw appError("INVALID_PLAN_WORK", "Invalid plan work id", 400);

      let tooth = u.tooth_number;
      tooth = tooth === "" || tooth === null || tooth === undefined ? null : Number(tooth);
      if (tooth !== null && (!Number.isInteger(tooth) || tooth < 11 || tooth > 85)) {
        throw appError("INVALID_TOOTH", "Tooth number is invalid", 400);
      }

      const row = await sessionModel.updatePlanWorkTooth(id, tooth, session_id, tenant_id, branch_id, client);
      if (!row) throw appError("PLAN_WORK_NOT_FOUND", `Plan work ${id} not found for this session`, 404);
      out.push(row);
    }
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _delete(sessionID, tenant_id, branch_id) {
  try {
    const deletedsession = await sessionModel.deleteSession(sessionID, tenant_id, branch_id);
    if (!deletedsession) throw appError('DELETE_SESSION_FAILED', 'session failed to delete', 500);
    return deletedsession;
  } catch (err) {
    if (err.code === '23503') {
      throw appError('SESSION_HAS_RECORDS', 'Cannot delete this session. It has existing payments.', 409);
    }
    throw err;
  }
}

async function getUnpaid(tenant_id, branch_id, { limit, q } = {}) {
  // STEP 1: base unpaid sessions
  const { rows: baseSessions, total } = await sessionModel.getAllUnPaidSessions(tenant_id, branch_id, { limit, q });
  if (baseSessions.length === 0) return { sessions: [], total };

  const sessionIds = baseSessions.map(s => s.session_id);

  // STEP 2 + 3: fetch works and plans in parallel
  const [worksRows, planRows] = await Promise.all([
    sessionModel.getWorksForSessions(sessionIds, tenant_id, branch_id),
    sessionModel.getTreatmentPlansForSessions(sessionIds, tenant_id, branch_id),
  ]);

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

  // STEP 4: group and build final response
  const sessions = baseSessions.map(s => {
    const ws = worksBySession[s.session_id] || { items_count: 0, works: [] };



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

      // âœ… THIS UNBLOCKS YOUR FRONTEND
      treatment_plans: plansBySession[s.session_id] || [],
    };
  });
  return { sessions, total };
}


// SERVICE: Pay session
async function pay({ sessionId, normalAmount, planPayments, note, userId }, tenant_id, branch_id) {
  const client = await pool.connect();


  try {
    await client.query("BEGIN");

    // âœ… lock session row (prevents double-pay race)
    const session = await sessionModel.getSessionWithAppointmentForUpdate(sessionId, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

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

    // what is actually due (has_plan_due comes from the lock query — no extra round-trip)
    const sessionDue = total > totalPaid;
    const planDue = session.has_plan_due;

    // â— RULE: allow empty ONLY if nothing is due
    if (!payNormal && !payPlans) {
      if (sessionDue || planDue) {
        throw appError(
          "NO_PAYMENT_PROVIDED",
          "No payment amount specified",
          400
        );
      }

      // âœ… nothing due â†’ valid request â†’ just exit
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
        tenant_id, branch_id, client
      );

      const recalc = await sessionPaymentModel.recalcSessionTotals(sessionId, tenant_id, branch_id, client);
      session.total_paid = recalc.total_paid;
      session.is_paid = recalc.is_paid;
    }

    // -------------------------
    // 2) TREATMENT PLAN PAYMENTS
    // -------------------------
    let updatedPlans = [];

    if (payPlans) {
      const plansInSession = await sessionModel.getTreatmentPlansForSession(sessionId, tenant_id, branch_id, client);
      const allowedPlanIds = new Set(plansInSession.map((tp) => Number(tp.id)));

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

        // âœ… lock plan row (prevents race overpay on same plan)
        const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(plan_id, tenant_id, branch_id, client);
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


        await treatmentPlanPaymentModel.createTreatmentPlanPayment(
          {
            treatmentPlanId: plan_id,
            sessionId,
            amount,
            note,
            createdBy: userId,
          },
          tenant_id, branch_id, client
        );

        const updatedPlan = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(plan_id, tenant_id, branch_id, client);
        updatedPlans.push(updatedPlan);
      }
    }

    await client.query("COMMIT");

    return {
      session: {
        session_id: session.session_id,
        totals: {
          min_total: Number(session.min_total),
          total: Number(session.total),
          total_paid: Number(session.total_paid),
          is_paid: session.is_paid,
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


  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export default {
  getAll, getNormal, editNormal, delete: _delete, getUnpaid, pay, updatePlanWorkTeeth
}
