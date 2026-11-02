import appError from '../utils/appError.js';

import pool from '../db_connection.js';
import sessionModel from '../models/sessionModel.js';
import sessionPaymentModel from '../models/sessionPaymentModel.js';
import appointmentModel from '../models/appointmentModel.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import treatmentPlanPaymentModel from '../models/treatmentPlanPaymentModel.js';
import prescriptionModel from '../models/prescriptionModel.js';
import dateRange from '../utils/dateRange.js';
import settingModel from '../models/settingModel.js';
import discountModel from '../models/discountModel.js';
import withTransaction from '../utils/withTransaction.js';
import cents from '../utils/money.js';
import worksService from './worksService.js';
import { ownId } from '../utils/scope.js';

// lock plan rows always in id order, so two requests can never deadlock
async function lockPlansInOrder(planIds, tenant_id, branch_id, client) {
  const ids = [...new Set(planIds.map(Number).filter(Boolean))].sort((a, b) => a - b);
  for (const id of ids) await treatmentPlanModel.getTreatmentPlanByIdForUpdate(id, tenant_id, branch_id, client);
}

function buildWorksSummary(worksRows) {
  if (!worksRows || worksRows.length === 0) {
    return {
      items_count: 0,
      works: [],
    };
  }

  const groups = {}; // key: work_id-unit_price

  for (const row of worksRows) {
    // include arch in the key so an Upper and a Lower of the same work stay separate
    const key = `${row.work_id}-${row.unit_price}-${row.arch || ''}`;

    if (!groups[key]) {
      groups[key] = {
        work_id: row.work_id,                      // keep the id so the UI never matches by name
        work_name: row.work_name,
        quantity: 0,
        total_price: 0,
        teeth: [],
        arch: row.arch || null,                    // whole-mouth region: null | 'upper' | 'lower'
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
    is_completed: !!row.plan_is_completed,
    tooth_number: row.tooth_number,
    quantity: row.quantity,
  }));
}

async function getAll({ day, search, page, limit, viewer }, tenant_id, branch_id) {
  const settings = await settingModel.getEffectiveSettings(tenant_id, branch_id);
  const range = day ? dateRange.getDateRange(day, settings?.timezone) : null;
  const result = await sessionModel.getAllNormalSessions({
    from: range ? range.from : null,
    to: range ? range.to : null,
    search,
    doctor_id: ownId(viewer, 'view_session'),   // "own only" -> just this doctor's visits
    page,
    limit,
  }, tenant_id, branch_id);
  return result;
}

async function getNormal(session_id, tenant_id, branch_id) {

  const [base, allWorks, payments, planPayments] = await Promise.all([
    sessionModel.getNormalSession(session_id, tenant_id, branch_id),
    sessionModel.getAllWorksForSession(session_id, tenant_id, branch_id), // normal + plan, with work_id
    sessionPaymentModel.listForSession(session_id, tenant_id, branch_id),
    treatmentPlanPaymentModel.listForSession(session_id, tenant_id, branch_id),
  ]);
  if (!base) throw appError("SESSION_NOT_FOUND", "session not found", 404);

  const normalRows = allWorks.filter((r) => r.treatment_plan_id == null);
  const planRows = allWorks.filter((r) => r.treatment_plan_id != null);

  const worksSummary = buildWorksSummary(normalRows); // editable normal works
  const planWorks = buildPlanWorks(planRows);          // read-only plan works

  // prescription lives on the appointment (the visit) — load it so the doctor
  // sees/edits it inside the session.
  const prescription = await prescriptionModel.getByAppointment(base.appointment_id, tenant_id, branch_id);

  return {
    session: {
      session_id: base.session_id,
      appointment_id: base.appointment_id,
      currency_code: base.currency_code,
      prescription: { items: prescription?.items || [] },

      totals: {
        min_total: Number(base.min_total),
        total: Number(base.total),
        total_paid: Number(base.total_paid || 0),
        discount_amount: Number(base.discount_amount || 0),
        remaining: Math.max(0, Number(base.total) - Number(base.total_paid || 0) - Number(base.discount_amount || 0)),
        is_paid: base.is_paid,
        is_settled: !!base.is_settled,
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
        age: base.patient_age,
      },

      doctor: {
        id: base.doctor_id,
        full_name: base.doctor_name,
      },

      processed_by: base.processed_by || null,

      payment_note: base.payment_note || "",
    },

    sw_id: base.sw,
    works_summary: worksSummary, // <-- Filling 3x, Scaling 2x, etc. (editable normal works)
    plan_works: planWorks,       // <-- treatment-plan works, read-only display
    // every normal work row exactly as stored (price per row) — the editor edits these
    normal_works: normalRows.map((r) => ({
      session_work_id: r.session_work_id,
      work_id: r.work_id,
      work_name: r.work_name,
      tooth_number: r.tooth_number,
      quantity: r.quantity,
      unit_price: Number(r.unit_price),
      min_unit_price: Number(r.min_unit_price),
      total_price: Number(r.total_price),
      arch: r.arch || null,
      is_whole_mouth: !!r.is_whole_mouth,
    })),
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    plan_payments: planPayments.map((p) => ({ ...p, amount: Number(p.amount) })),

  };
}

async function editNormal(session_id, fields, userId, tenant_id, branch_id) {
  const { notes, next_plan, works, prescription, completedPlanIds } = fields;

  return withTransaction(async (client) => {
    // 1) lock the live session — no payment/edit can run on it at the same time
    const base = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!base) throw appError("SESSION_NOT_FOUND", "session not found", 404);

    const currentPaid = Number(base.total_paid) || 0;

    // 2) normal works: the list sent is the full new list (it may be empty)
    let normalMinTotal = Number(base.min_total) || 0;
    let normalGrandTotal = Number(base.total) || 0;

    if (works) {
      // prices this visit was saved with — an old work may keep its own price
      const saved = await sessionModel.getNormalWorkPrices(session_id, tenant_id, branch_id, client);
      const savedMap = Object.fromEntries(saved.map(r => [Number(r.work_id), r]));
      await lockPlansInOrder(works.map(w => w.treatment_plan_id), tenant_id, branch_id, client);

      await sessionModel.deleteSessionWorksBySiD(session_id, tenant_id, branch_id, client);
      normalMinTotal = 0;
      normalGrandTotal = 0;

      const workIds = works.map(w => w.work_id);
      const catalogRows = workIds.length ? await workCatalogModel.getWorksByIds(workIds, tenant_id, branch_id, client) : [];
      const catalogMap = Object.fromEntries(catalogRows.map(c => [c.id, c]));

      const workItems = [];
      for (const w of works) {
        const { work_id, quantity, tooth_number } = w;

        const catalog = catalogMap[work_id];
        if (!catalog) throw appError("WORK_NOT_FOUND", "Work not found", 404);

        const code = String(catalog.code || "").toLowerCase();
        const minUnit = Number(catalog.min_price) || 0;
        // the catalog price is the MINIMUM; reception may charge more. A work already
        // saved in this visit may keep its old price (catalog raised later).
        const old = catalog.is_plan ? null : savedMap[Number(work_id)];
        const floor = old ? Math.min(minUnit, Number(old.low_unit)) : minUnit;
        const normalMin = old ? Math.min(minUnit, Number(old.low_min)) : minUnit;
        const unit = w.unit_price !== undefined && w.unit_price !== null ? Number(w.unit_price) : minUnit;
        if (!catalog.is_plan && cents(unit) < cents(floor)) {
          throw appError("WORK_PRICE_BELOW_MIN", `Price of ${catalog.name} cannot be less than ${floor}`, 400);
        }
        const qty = Number(quantity) || 1;

        // Treatment-plan works added during an edit: CONTINUE an existing active
        // plan (treatment_plan_id) or start a NEW one with its agreement total.
        let treatmentPlanId = null;
        if (catalog.is_plan) {
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

        // plan works are priced by their plan agreement, not here
        const rowUnit = treatmentPlanId === null ? unit : minUnit;
        const rowMin = treatmentPlanId === null ? normalMin : minUnit;
        workItems.push({
          sessionId: session_id,
          workId: work_id,
          quantity: qty,
          toothNumber: tooth_number ?? null,
          minUnitPrice: rowMin,
          unitPrice: rowUnit,
          totalMinPrice: rowMin * qty,
          totalPrice: rowUnit * qty,
          treatmentPlanId,
          // whole-mouth region (only whole-mouth works carry it; per-tooth works use teeth)
          arch: catalog.is_whole_mouth ? (w.arch ?? null) : null,
        });

        // plan works don't count toward the session (normal) total
        if (treatmentPlanId === null) {
          normalMinTotal += normalMin * qty;
          normalGrandTotal += unit * qty;
        }
      }
      // new treatments must be allowed for the visit's doctor; ones already saved
      // in this visit stay editable even if the manager unticked them later
      await worksService.assertAllowedForDoctor(base.doctor_id, workIds, Object.keys(savedMap), tenant_id, branch_id, client);

      if (workItems.length) await sessionModel.bulkCreateSessionWorks(workItems, tenant_id, branch_id, client);

      // never let the bill drop below money already taken (that is how "overpaid" happened)
      if (cents(normalGrandTotal) < cents(currentPaid)) {
        throw appError("TOTAL_BELOW_PAID",
          `The new total (${normalGrandTotal}) is less than what was already paid (${currentPaid}). Edit or delete the payments first.`, 400);
      }
    }

    // 3) totals, then discount cap, then paid/is_paid from the real payment rows
    const updatedTotals = await sessionModel.updateSessionTotal(
      {
        min_total: normalMinTotal,
        total: normalGrandTotal,
        total_paid: currentPaid,
        is_paid: base.is_paid,
        sessionId: session_id,
      },
      tenant_id, branch_id, client
    );
    if (!updatedTotals) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);
    await sessionModel.capDiscount(session_id, tenant_id, branch_id, client);
    const recalc = await sessionPaymentModel.recalcSessionTotals(session_id, tenant_id, branch_id, client);

    // 4) notes / next_plan (only if provided)
    if (notes !== undefined || next_plan !== undefined) {
      const notess = {};
      if (notes !== undefined) notess.notes = notes;
      if (next_plan !== undefined) notess.next_plan = next_plan;
      const updatedPlan = await sessionModel.updateSessionNotesFields(session_id, notess, tenant_id, branch_id, client);
      if (!updatedPlan) throw appError("SESSION_UPDATE_FAILED", "session Update failed", 500);
    }

    // prescription (optional) — saved against the session's appointment, same transaction
    if (prescription !== undefined) {
      await prescriptionModel.saveForAppointment(
        { appointment_id: base.appointment_id, tenant_id, branch_id, doctor_id: userId, items: prescription || [] },
        client
      );
    }

    // Mark treatment plans "Done" (doctor ticked them in the editor). Each plan
    // must belong to THIS patient — same guard the completion flow uses.
    if (Array.isArray(completedPlanIds) && completedPlanIds.length > 0) {
      await lockPlansInOrder(completedPlanIds, tenant_id, branch_id, client);
      for (const pid of completedPlanIds) {
        const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(Number(pid), tenant_id, branch_id, client);
        if (plan && Number(plan.patient_id) === Number(base.patient_id)) {
          await treatmentPlanModel.markCompleted(Number(pid), tenant_id, branch_id, client);
        }
      }
    }

    return {
      session_id,
      min_total: Number(recalc.min_total),
      total: Number(recalc.total),
      total_paid: Number(recalc.total_paid),
      is_paid: recalc.is_paid,
    };
  });
}


// Update ONLY the tooth of treatment-plan works in a session. No money, no plan
// changes. updates = [{ session_work_id, tooth_number }].
async function updatePlanWorkTeeth(session_id, updates, tenant_id, branch_id) {
  if (!Array.isArray(updates) || updates.length === 0) return [];

  return withTransaction(async (client) => {
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
    return out;
  });
}

// ── Normal payments of a session (one row = one payment) ─────────────────────
// Editing keeps the payment's date, so the money stays in the month it was received.
async function editPayment(session_id, payment_id, { amount, note }, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const payment = await sessionPaymentModel.getByIdForUpdate(payment_id, session_id, tenant_id, branch_id, client);
    if (!payment) throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);

    const oldAmount = Number(payment.amount);
    const newAmount = Number(amount);
    const newPaid = Number(session.total_paid) - oldAmount + newAmount;
    const limit = Number(session.total) - Number(session.discount_amount || 0);
    // raising a payment may never make the visit paid more than its bill
    if (newAmount > oldAmount && cents(newPaid) > cents(limit)) {
      throw appError("PAYMENT_EXCEEDS_TOTAL", `Payments (${newPaid}) cannot be more than the session total (${limit})`, 400);
    }

    const updated = await sessionPaymentModel.updatePayment(
      payment_id, newAmount, note !== undefined ? note : payment.note, tenant_id, branch_id, client);
    await sessionModel.capDiscount(session_id, tenant_id, branch_id, client);
    const totals = await sessionPaymentModel.recalcSessionTotals(session_id, tenant_id, branch_id, client);
    return { payment: updated, totals: { total: Number(totals.total), total_paid: Number(totals.total_paid), is_paid: totals.is_paid } };
  });
}

async function deletePayment(session_id, payment_id, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const payment = await sessionPaymentModel.getByIdForUpdate(payment_id, session_id, tenant_id, branch_id, client);
    if (!payment) throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);

    const deleted = await sessionPaymentModel.deletePayment(payment_id, tenant_id, branch_id, client);
    const totals = await sessionPaymentModel.recalcSessionTotals(session_id, tenant_id, branch_id, client);
    return { payment: deleted, totals: { total: Number(totals.total), total_paid: Number(totals.total_paid), is_paid: totals.is_paid } };
  });
}

// ── Treatment-plan payments taken in this session ───────────────────────────
async function editPlanPayment(session_id, payment_id, { amount, note }, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const payment = await treatmentPlanPaymentModel.getByIdForUpdate(payment_id, session_id, tenant_id, branch_id, client);
    if (!payment) throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);

    const plan = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(payment.treatment_plan_id, tenant_id, branch_id, client);
    if (!plan) throw appError("PLAN_NOT_FOUND", "Treatment plan not found", 404);

    const raising = Number(amount) > Number(payment.amount);
    const updated = await treatmentPlanPaymentModel.updatePayment(
      payment_id, Number(amount), note !== undefined ? note : payment.note, tenant_id, branch_id, client);
    const updatedPlan = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(plan.id, tenant_id, branch_id, client);
    if (raising && cents(updatedPlan.total_paid) > cents(updatedPlan.agreed_total)) {
      throw appError("AMOUNT_EXCEEDS_REMAINING", `Plan payments cannot be more than the agreed total (${Number(updatedPlan.agreed_total)})`, 400);
    }
    return { payment: updated, plan: updatedPlan };
  });
}

async function deletePlanPayment(session_id, payment_id, userId, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const payment = await treatmentPlanPaymentModel.getByIdForUpdate(payment_id, session_id, tenant_id, branch_id, client);
    if (!payment) throw appError("PAYMENT_NOT_FOUND", "Payment not found", 404);

    await treatmentPlanModel.getTreatmentPlanByIdForUpdate(payment.treatment_plan_id, tenant_id, branch_id, client);
    const deleted = await treatmentPlanPaymentModel.voidPayment(payment_id, userId, tenant_id, branch_id, client);
    const updatedPlan = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(payment.treatment_plan_id, tenant_id, branch_id, client);
    return { payment: deleted, plan: updatedPlan };
  });
}

// ── Treatment-plan works in this session ────────────────────────────────────
// Remove one plan work. If it was the plan's last work in this visit and the visit
// still has payments for that plan, those must be removed first (no orphan money).
async function deletePlanWork(session_id, session_work_id, userId, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const work = await sessionModel.getPlanWorkForUpdate(session_work_id, session_id, tenant_id, branch_id, client);
    if (!work) throw appError("PLAN_WORK_NOT_FOUND", "Plan work not found in this session", 404);
    const planId = work.treatment_plan_id;
    await treatmentPlanModel.getTreatmentPlanByIdForUpdate(planId, tenant_id, branch_id, client);

    const worksLeft = await sessionModel.countLivePlanWorksInSession(session_id, planId, tenant_id, branch_id, client) - 1;
    const paymentsHere = await treatmentPlanPaymentModel.countLiveForPlanInSession(session_id, planId, tenant_id, branch_id, client);
    if (worksLeft === 0 && paymentsHere > 0) {
      throw appError("PLAN_WORK_HAS_PAYMENTS", "This visit has payments for this plan. Delete those payments first.", 409);
    }

    await sessionModel.voidSessionWork(session_work_id, userId, tenant_id, branch_id, client);
    const removedPlan = await treatmentPlanModel.voidPlanIfEmpty(planId, userId, tenant_id, branch_id, client);
    return { removed_plan_id: removedPlan ? Number(removedPlan.id) : null };
  });
}

// Move one plan work to another plan of the SAME patient and type (wrong plan picked).
// If no work of the old plan is left in this visit, this visit's payments for the
// old plan move with it, and both plans' paid totals are recalculated.
async function movePlanWork(session_id, session_work_id, toPlanId, userId, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(session_id, tenant_id, branch_id, client);
    if (!session) throw appError("SESSION_NOT_FOUND", "Session not found", 404);

    const work = await sessionModel.getPlanWorkForUpdate(session_work_id, session_id, tenant_id, branch_id, client);
    if (!work) throw appError("PLAN_WORK_NOT_FOUND", "Plan work not found in this session", 404);
    const fromPlanId = Number(work.treatment_plan_id);
    if (fromPlanId === Number(toPlanId)) throw appError("SAME_PLAN", "The work is already in this plan", 400);

    // lock both plans in id order so two moves can never deadlock
    const [firstId, secondId] = [fromPlanId, Number(toPlanId)].sort((a, b) => a - b);
    await treatmentPlanModel.getTreatmentPlanByIdForUpdate(firstId, tenant_id, branch_id, client);
    await treatmentPlanModel.getTreatmentPlanByIdForUpdate(secondId, tenant_id, branch_id, client);
    const target = await treatmentPlanModel.getTreatmentPlanByIdForUpdate(Number(toPlanId), tenant_id, branch_id, client);
    if (!target) throw appError("PLAN_NOT_FOUND", "Target treatment plan not found", 404);
    if (Number(target.patient_id) !== Number(session.patient_id)) throw appError("PLAN_PATIENT_MISMATCH", "Treatment plan does not belong to this patient", 400);
    if (String(target.type) !== String(work.plan_type)) throw appError("PLAN_TYPE_MISMATCH", `Target plan is not a ${work.plan_type} plan`, 400);

    await sessionModel.movePlanWork(session_work_id, target.id, tenant_id, branch_id, client);

    const oldWorksLeft = await sessionModel.countLivePlanWorksInSession(session_id, fromPlanId, tenant_id, branch_id, client);
    if (oldWorksLeft === 0) {
      await treatmentPlanPaymentModel.movePaymentsInSession(session_id, fromPlanId, target.id, tenant_id, branch_id, client);
    }

    await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(fromPlanId, tenant_id, branch_id, client);
    const updatedTarget = await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(target.id, tenant_id, branch_id, client);
    if (cents(updatedTarget.total_paid) > cents(updatedTarget.agreed_total)) {
      throw appError("AMOUNT_EXCEEDS_REMAINING", `The payments would exceed the target plan's agreed total (${Number(updatedTarget.agreed_total)})`, 400);
    }
    const removedPlan = await treatmentPlanModel.voidPlanIfEmpty(fromPlanId, userId, tenant_id, branch_id, client);
    return { moved_to_plan_id: Number(target.id), removed_plan_id: removedPlan ? Number(removedPlan.id) : null };
  });
}

// Delete a whole visit: its normal payments, plan payments and works leave the
// reports, the session + appointment are voided, and every touched plan's paid is
// recalculated (a plan left with nothing is voided too). All or nothing.
async function _delete(sessionID, deletedBy, tenant_id, branch_id) {
  return withTransaction(async (client) => {
    const session = await sessionModel.lockLiveSession(sessionID, tenant_id, branch_id, client);
    if (!session) throw appError('SESSION_NOT_FOUND', 'Session not found or already deleted', 404);

    const sessionPayments = await sessionPaymentModel.deleteAllForSession(sessionID, tenant_id, branch_id, client);
    const planPayments = await treatmentPlanPaymentModel.voidAllForSession(sessionID, deletedBy, tenant_id, branch_id, client);
    const works = await sessionModel.voidAllWorksForSession(sessionID, deletedBy, tenant_id, branch_id, client);

    await sessionModel.voidSession(sessionID, deletedBy, tenant_id, branch_id, client);
    await appointmentModel.voidAppointmentRow(session.appointment_id, deletedBy, tenant_id, branch_id, client);

    const planIds = [...new Set([...planPayments, ...works]
      .map((r) => r.treatment_plan_id).filter((id) => id !== null && id !== undefined).map(Number))];
    const removedPlans = [];
    for (const planId of planIds) {
      await treatmentPlanPaymentModel.recalcTreatmentPlanTotals(planId, tenant_id, branch_id, client);
      const removed = await treatmentPlanModel.voidPlanIfEmpty(planId, deletedBy, tenant_id, branch_id, client);
      if (removed) removedPlans.push(Number(removed.id));
    }

    return {
      session_id: sessionID,
      works_removed: works.length,
      session_payments_removed: sessionPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      plan_payments_removed: planPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      removed_plan_ids: removedPlans,
    };
  });
}

async function getUnpaid(tenant_id, branch_id, { limit, q, floor_id, viewer } = {}) {
  // STEP 1: base unpaid sessions (floor_id = the doctor's current floor, same as appointments)
  const { rows: baseSessions, total } = await sessionModel.getAllUnPaidSessions(tenant_id, branch_id, { limit, q, floor_id, doctor_id: ownId(viewer, 'view_session') });
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

  // A plan's debt is shown on ONE row only (the visit that owns it), so the
  // same 120,000 is never listed — or paid from — two visits. Fully paid
  // plans carry no money and keep their "done" line.
  const ownedBySession = {};
  for (const s of baseSessions) ownedBySession[s.session_id] = new Set((s.owned_plan_ids || []).map(String));

  const plansBySession = {};
  for (const row of planRows) {
    const owes = Number(row.agreed_total) > Number(row.total_paid || 0);
    if (owes && !ownedBySession[row.session_id]?.has(String(row.id))) continue;

    if (!plansBySession[row.session_id]) {
      plansBySession[row.session_id] = [];
    }

    plansBySession[row.session_id].push({
      id: row.id,
      type: row.type,
      agreed_total: Number(row.agreed_total),
      total_paid: Number(row.total_paid || 0),
      remaining: Math.max(0, Number(row.agreed_total) - Number(row.total_paid || 0)), // whole plan, not this visit
      currency_code: row.currency_code,
      works_count: row.works_count,   // this plan's works in THIS session
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
      currency_code: s.currency_code,

      patient: {
        id: s.patient_id,
        full_name: s.patient_name,
        phone: s.patient_phone,
        extra_phones: s.patient_extra_phones,
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
        discount_amount: Number(s.discount_amount || 0),
        discount_name: s.discount_name || null,
        remaining: Math.max(0, Number(s.total) - Number(s.total_paid || 0) - Number(s.discount_amount || 0)),
        is_paid: !!s.is_paid, // normal balance settled/fully paid → frontend hides the normal section
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
async function pay({ sessionId, normalAmount, planPayments, note, settleNormal, discountId, userId }, tenant_id, branch_id) {
  const client = await pool.connect();


  try {
    await client.query("BEGIN");

    // prevents double-pay race
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
    if (!payNormal && !payPlans && !settleNormal && !discountId) {
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

    // the branch's workflow switches decide if settle / discounts may be used
    const workflow = (settleNormal || discountId)
      ? await settingModel.getWorkflow(tenant_id, branch_id, client)
      : null;

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

      // never take more than what is still owed on the session
      const remaining = total - totalPaid - Number(session.discount_amount || 0);
      if (cents(numericAmount) > cents(remaining)) {
        throw appError("PAYMENT_EXCEEDS_REMAINING", `Amount is more than the remaining balance (${remaining})`, 400);
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

    // Apply a named discount to the NORMAL balance (reception picks it at pay time).
    // Does NOT touch any price/cost — it's recorded as discount_amount on the
    // session and never exceeds what's still owed. Plan balances are untouched.
    if (discountId && !session.is_paid) {
      if (!workflow.allow_discounts) {
        throw appError("DISCOUNTS_NOT_ALLOWED", "Discounts are turned off in this branch", 403);
      }
      const discount = await discountModel.getDiscountById(Number(discountId), tenant_id, branch_id, client);
      if (!discount || !discount.is_active) throw appError("DISCOUNT_NOT_FOUND", "Discount not found", 404);

      const remainingBefore = Math.max(0, total - Number(session.total_paid || 0));
      const raw = discount.type === "percent"
        ? Math.round((total * Number(discount.value)) / 100)
        : Number(discount.value);
      const discountAmount = Math.min(raw, remainingBefore); // cap: never exceed what's owed

      // never more than the branch's biggest allowed discount (% of the visit total,
      // rounded the same way a percent discount is rounded above)
      const maxAmount = Math.round((total * Number(workflow.max_discount_percent)) / 100);
      if (cents(discountAmount) > cents(maxAmount)) {
        throw appError("DISCOUNT_OVER_MAX", `The biggest discount allowed in this branch is ${workflow.max_discount_percent}%`, 400);
      }

      const applied = await sessionModel.applyDiscount(sessionId, discount.id, discountAmount, tenant_id, branch_id, client);
      session.total_paid = applied.total_paid;
      session.is_paid = applied.is_paid;
    }

    // Settle the normal balance (checkbox in the pay modal): close it as done even
    // if paid less than the total — a discount. Treatment-plan balances are NOT
    // touched here; they stay tracked separately.
    if (settleNormal && !session.is_paid) {
      if (!workflow.allow_settle_unpaid) {
        throw appError("SETTLE_NOT_ALLOWED", "Closing a visit without the full payment is turned off in this branch", 403);
      }
      const settled = await sessionModel.markSessionSettled(sessionId, tenant_id, branch_id, client);
      session.total_paid = settled.total_paid;
      session.is_paid = settled.is_paid;
    }

    // -------------------------
    // 2) TREATMENT PLAN PAYMENTS
    // -------------------------
    let updatedPlans = [];

    if (payPlans) {
      const plansInSession = await sessionModel.getTreatmentPlansForSession(sessionId, tenant_id, branch_id, client);
      const allowedPlanIds = new Set(plansInSession.map((tp) => Number(tp.id)));
      await lockPlansInOrder(planPayments.map((d) => d.plan_id).filter((id) => allowedPlanIds.has(Number(id))), tenant_id, branch_id, client);

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
        if (cents(amount) > cents(remainingAmount)) {
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
  getAll, getNormal, editNormal, delete: _delete, getUnpaid, pay, updatePlanWorkTeeth,
  editPayment, deletePayment, editPlanPayment, deletePlanPayment, deletePlanWork, movePlanWork,
}
