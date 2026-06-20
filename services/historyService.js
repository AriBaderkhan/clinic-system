import historyModel from '../models/historyModel.js'
import sessionModel from '../models/sessionModel.js'
import sessionImageService from './sessionImageService.js';
import appError from '../utils/appError.js';



async function getPayments(tenant_id, branch_id) {
  const allPayments = await historyModel.getPaymentsHistory(tenant_id, branch_id);
  if (allPayments.length == 0) return [];

  return allPayments;
}



function buildWorksSummary(worksRows) {
  if (!worksRows || worksRows.length === 0) {
    return {
      items_count: 0,
      works: [],
    };
  }

  const groups = {}; // key: work_id-unit_price-plan

  for (const row of worksRows) {
    const isPlan = !!row.treatment_plan_id;
    const key = `${row.work_id}-${row.unit_price}-${row.treatment_plan_id || 'normal'}`;

    if (!groups[key]) {
      groups[key] = {
        work_name: row.work_name,
        quantity: 0,
        total_price: 0,
        teeth: [],
        is_plan: isPlan,                           // treatment-plan work vs normal
        plan_type: row.plan_type || null,
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

async function getSessionDetails(session_id, tenant_id, branch_id) {
  // 1) base session + patient + doctor + appointment
  const base = await historyModel.getSessionDetails(session_id, tenant_id, branch_id);
  if (!base) {
    throw appError("SESSION_NOT_FOUND", "session not found", 404);
  }

  // 2) ALL works for this session — normal + treatment-plan together
  const worksRows = await sessionModel.getAllWorksForSession(session_id, tenant_id, branch_id);
  const worksSummary = buildWorksSummary(worksRows);

  // 3) (optional now) payments for this session – you can add later
  let payments = [];
  if (historyModel.getSessionPayments) {
    payments = await historyModel.getSessionPayments(session_id, tenant_id, branch_id);
  }

  // 3b) case images (with fresh signed URLs); never breaks details if storage hiccups
  const images = await sessionImageService.listForDetails(session_id, tenant_id, branch_id);

  // 4) final clean object for frontend
  return {
    session: {
      session_id: base.session_id,
      appointment_id: base.appointment_id,
      currency_code: base.currency_code,

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
      payment_note: base.payment_note  // <== added field for session payemtn details
    },

    works_summary: worksSummary,     // <-- Filling 3x, Scaling 2x, etc.
    payments,                        // <-- leave empty for now if you want
    images,                          // <-- case photos/x-rays for this session
  };
}




export default { getPayments, getSessionDetails }