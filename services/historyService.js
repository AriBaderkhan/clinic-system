import historyModel from '../models/historyModel.js'
import sessionModel from '../models/sessionModel.js'
import appError from '../utils/appError.js';



async function serviceGetPaymentsHistory(){
    const allPayments = await historyModel.getPaymentsHistory();
    if(allPayments.length == 0) return [];

    return allPayments;
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

async function serviceGetSessionDetails(session_id) {
  // 1) base session + patient + doctor + appointment
  const base = await historyModel.getSessionDetails(session_id);
  if (!base) {
    throw appError("SESSION_NOT_FOUND", "session not found",404);
  }

  // 2) works for this session (note the ARRAY argument)
  const worksRows = await sessionModel.getWorksForSessions([session_id]);
  const worksSummary = buildWorksSummary(worksRows);

  // 3) (optional now) payments for this session – you can add later
  let payments = [];
  if (historyModel.getSessionPayments) {
    payments = await historyModel.getSessionPayments(session_id);
  }

  // 4) final clean object for frontend
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

    works_summary: worksSummary, // <-- Filling 3x, Scaling 2x, etc.
    payments,                    // <-- leave empty for now if you want
  };
}




export default { serviceGetPaymentsHistory,serviceGetSessionDetails }