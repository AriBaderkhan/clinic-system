import appError from '../utils/appError.js';
import pool from '../db_connection.js';

import labModel from '../models/labModel.js';
import workCatalogModel from '../models/workCatalogModel.js';
import patientModel from '../models/patientModel.js';
import doctorModel from '../models/docModel.js';
import appointmentModel from '../models/appointmentModel.js';

// ===================== LABS =====================

function checkTreatments(treatments, tenant_id, branch_id) {
  // no duplicated work in the same price list
  const ids = treatments.map((t) => t.work_id);
  if (new Set(ids).size !== ids.length) {
    throw appError('LAB_TREATMENT_DUPLICATE', 'Same treatment added more than once', 400);
  }
  return ids;
}

async function validateWorksExist(workIds, tenant_id, branch_id, client) {
  const works = await workCatalogModel.getWorksByIds(workIds, tenant_id, branch_id, client);
  if (works.length !== workIds.length) {
    throw appError('WORK_NOT_FOUND', 'One or more treatments not found', 404);
  }
}

async function createLab({ name, phone, treatments }, tenant_id, branch_id) {
  const workIds = checkTreatments(treatments, tenant_id, branch_id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await validateWorksExist(workIds, tenant_id, branch_id, client);

    const lab = await labModel.createLab(name, phone || null, tenant_id, branch_id, client);
    if (!lab) throw appError('LAB_CREATE_FAILED', 'Lab create failed', 500);

    const createdTreatments = await labModel.bulkCreateLabTreatments(lab.id, treatments, tenant_id, branch_id, client);

    await client.query('COMMIT');
    return { ...lab, treatments: createdTreatments };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getLabs({ search, page, limit }, tenant_id, branch_id) {
  const searchFilter = typeof search === 'string' && search.trim().length > 0 ? search.trim() : null;

  const result = await labModel.findLabsWithFilters({
    search: searchFilter,
    page,
    limit,
  }, tenant_id, branch_id);

  return result;
}

async function searchLabs(search, tenant_id, branch_id) {
  const q = typeof search === 'string' ? search.trim() : '';
  if (!q) return [];
  return labModel.searchLabs(q, tenant_id, branch_id);
}

async function getLabById(labId, tenant_id, branch_id) {
  const [lab, treatments] = await Promise.all([
    labModel.getLabById(labId, tenant_id, branch_id),
    labModel.getLabTreatments(labId, tenant_id, branch_id),
  ]);
  if (!lab) throw appError('LAB_NOT_FOUND', 'Lab not found', 404);

  return { ...lab, treatments };
}

async function updateLab(labId, { name, phone, treatments }, tenant_id, branch_id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lab = await labModel.getLabById(labId, tenant_id, branch_id, client);
    if (!lab) throw appError('LAB_NOT_FOUND', 'Lab not found', 404);

    const fields = {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
    };

    let updated = lab;
    if (Object.keys(fields).length > 0) {
      updated = await labModel.updateLab(labId, fields, tenant_id, branch_id, client);
      if (!updated) throw appError('LAB_UPDATE_FAILED', 'Lab update failed', 500);
    }

    // replace the whole price list when treatments are sent
    let updatedTreatments;
    if (treatments !== undefined) {
      const workIds = checkTreatments(treatments, tenant_id, branch_id);
      await validateWorksExist(workIds, tenant_id, branch_id, client);

      await labModel.deleteLabTreatments(labId, tenant_id, branch_id, client);
      updatedTreatments = await labModel.bulkCreateLabTreatments(labId, treatments, tenant_id, branch_id, client);
    } else {
      updatedTreatments = await labModel.getLabTreatments(labId, tenant_id, branch_id, client);
    }

    await client.query('COMMIT');
    return { ...updated, treatments: updatedTreatments };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteLab(labId, tenant_id, branch_id) {
  const deletedLab = await labModel.deleteLab(labId, tenant_id, branch_id);
  if (!deletedLab) throw appError('LAB_NOT_FOUND', 'Lab not found', 404);
  return deletedLab;
}

// ===================== ORDERS =====================

async function createOrder({ lab_id, appointment_id, patient_id, doctor_id, work_id, quantity, notes, created_by }, tenant_id, branch_id) {
  // appointment chosen -> patient and doctor come from it automatically
  if (appointment_id) {
    const appt = await appointmentModel.getAppointment(appointment_id, tenant_id, branch_id);
    if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
    patient_id = appt.patient_id;
    doctor_id = appt.doctor_id;
  }

  if (!patient_id || !doctor_id) {
    throw appError('ORDER_TARGET_REQUIRED', 'Select an appointment (or a patient and a doctor)', 400);
  }

  // independent lookups -> run them in parallel
  // (patient/doctor existence is already guaranteed when they come from the appointment)
  const [lab, labTreatment, patient, doctor] = await Promise.all([
    labModel.getLabById(lab_id, tenant_id, branch_id),
    labModel.getLabTreatmentCost(lab_id, work_id, tenant_id, branch_id),
    appointment_id ? null : patientModel.getPatient(patient_id, tenant_id, branch_id),
    appointment_id ? null : doctorModel.getDoctorById(doctor_id, tenant_id, branch_id),
  ]);

  if (!lab || !lab.is_active) throw appError('LAB_NOT_FOUND', 'Lab not found', 404);
  if (!labTreatment) throw appError('LAB_TREATMENT_NOT_FOUND', 'This lab does not offer this treatment', 400);
  if (!appointment_id && !patient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
  if (!appointment_id && !doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);

  // snapshot the cost at order time (price changes later must not affect old orders)
  const unit_cost = Number(labTreatment.cost);
  const total_cost = unit_cost * quantity;

  const order = await labModel.createOrder({
    lab_id, appointment_id, patient_id, doctor_id, work_id, quantity,
    unit_cost, total_cost, notes: notes || null, created_by,
  }, tenant_id, branch_id);
  if (!order) throw appError('LAB_ORDER_CREATE_FAILED', 'Order create failed', 500);

  return order;
}

const VALID_ORDER_STATUSES = ['ordered', 'ready', 'delivered', 'cancelled'];

async function getOrders({ status, lab_id, search, page, limit }, tenant_id, branch_id) {
  const statusFilter = VALID_ORDER_STATUSES.includes(status) ? status : null;
  const searchFilter = typeof search === 'string' && search.trim().length > 0 ? search.trim() : null;

  const result = await labModel.findOrdersWithFilters({
    status: statusFilter,
    lab_id: lab_id || null,
    search: searchFilter,
    page,
    limit,
  }, tenant_id, branch_id);

  return result;
}

async function getOrderById(orderId, tenant_id, branch_id) {
  const order = await labModel.getOrderById(orderId, tenant_id, branch_id);
  if (!order) throw appError('LAB_ORDER_NOT_FOUND', 'Order not found', 404);
  return order;
}

async function updateOrder(orderId, { patient_id, doctor_id, work_id, quantity, notes }, tenant_id, branch_id) {
  const order = await labModel.getOrderById(orderId, tenant_id, branch_id);
  if (!order) throw appError('LAB_ORDER_NOT_FOUND', 'Order not found', 404);

  const fields = {
    ...(patient_id ? { patient_id } : {}),
    ...(doctor_id ? { doctor_id } : {}),
    ...(notes !== undefined ? { notes: notes || null } : {}),
  };

  const newWorkId = work_id ?? order.work_id;
  const newQuantity = quantity ?? order.quantity;

  // treatment or quantity changed -> re-snapshot cost from this lab's price list
  if (work_id || quantity) {
    const labTreatment = await labModel.getLabTreatmentCost(order.lab_id, newWorkId, tenant_id, branch_id);
    if (!labTreatment) throw appError('LAB_TREATMENT_NOT_FOUND', 'This lab does not offer this treatment', 400);

    const unit_cost = Number(labTreatment.cost);
    fields.work_id = newWorkId;
    fields.quantity = newQuantity;
    fields.unit_cost = unit_cost;
    fields.total_cost = unit_cost * newQuantity;
  }

  if (patient_id) {
    const patient = await patientModel.getPatient(patient_id, tenant_id, branch_id);
    if (!patient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
  }

  if (doctor_id) {
    const doctor = await doctorModel.getDoctorById(doctor_id, tenant_id, branch_id);
    if (!doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);
  }

  if (Object.keys(fields).length === 0) {
    throw appError('NO_FIELDS_TO_UPDATE', 'No fields provided to update', 400);
  }

  const updated = await labModel.updateOrder(orderId, fields, tenant_id, branch_id);
  if (!updated) throw appError('LAB_ORDER_UPDATE_FAILED', 'Order update failed', 500);
  return updated;
}

const FINAL_ORDER_STATUSES = ['delivered', 'cancelled'];

async function setOrderStatus(orderId, status, tenant_id, branch_id) {
  if (!VALID_ORDER_STATUSES.includes(status)) {
    throw appError('INVALID_ORDER_STATUS', 'Invalid order status', 400);
  }

  const order = await labModel.getOrderById(orderId, tenant_id, branch_id);
  if (!order) throw appError('LAB_ORDER_NOT_FOUND', 'Order not found', 404);

  // delivered/cancelled are final — status can never change again
  if (FINAL_ORDER_STATUSES.includes(order.status)) {
    throw appError('ORDER_STATUS_LOCKED', `A ${order.status} order cannot change status anymore`, 400);
  }

  const updated = await labModel.setOrderStatus(orderId, status, tenant_id, branch_id);
  if (!updated) throw appError('LAB_ORDER_NOT_FOUND', 'Order not found', 404);
  return updated;
}

async function deleteOrder(orderId, tenant_id, branch_id) {
  const deletedOrder = await labModel.deleteOrder(orderId, tenant_id, branch_id);
  if (!deletedOrder) throw appError('LAB_ORDER_NOT_FOUND', 'Order not found', 404);
  return deletedOrder;
}

export default {
  createLab, getLabs, searchLabs, getLabById, updateLab, deleteLab,
  createOrder, getOrders, getOrderById, updateOrder, setOrderStatus, deleteOrder,
};
