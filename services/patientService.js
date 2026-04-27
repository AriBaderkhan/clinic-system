import patientModel from '../models/patientModel.js';
import appError from '../utils/appError.js';

async function serviceCreatePatient(patientData, tenant_id, branch_id) {

    const { name, phone, age, gender, address, created_by } = patientData;
    const patient = await patientModel.createPatient(name, phone, age, gender, address, created_by, tenant_id, branch_id);

    if (!patient) throw appError('INSERT_FAILED', 'Failed to create patient', 500);
    return patient;
}

async function serviceGetAllPatients(q, tenant_id, branch_id) {
    const patients = await patientModel.getAllPatients(q, tenant_id, branch_id);

    if (!patients || patients.length === 0) return [];
    return patients;
}

async function serviceGetPatient(patientId, tenant_id, branch_id) {

    const patient = await patientModel.getPatient(patientId, tenant_id, branch_id);

    if (!patient) throw appError('FETCH_PATIENT_FAILED', 'No patient found', 404);
    return patient;
}

async function serviceUpdatePatient(patientDataUpdate, tenant_id, branch_id) {
    const { patientId, fields, updatedBy } = patientDataUpdate;

    const thePatient = await patientModel.getPatient(patientId, tenant_id, branch_id)

    if (!thePatient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);

    const resultUpdate = await patientModel.updatePatient(patientId, fields, updatedBy, tenant_id, branch_id);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed', 500);

    return resultUpdate;
}

async function serviceDeletePatient(patientId, tenant_id, branch_id) {

    const result = await patientModel.deletePatient(patientId, tenant_id, branch_id)

    if (!result) throw appError('DELETE_FAILED', 'Delete operation failed', 500);
    return result;
}
// END OF CRUD

// for search available patient in creating appointment
async function searchPatientsService(q, tenant_id, branch_id) {
    return await patientModel.searchPatientsModel(q, tenant_id, branch_id);
}


async function serviceGetAllApptsPatient(patientId, tenant_id, branch_id) {

    const apptsPatient = await patientModel.getAllApptsPatient(patientId, tenant_id, branch_id);

    return apptsPatient;
}

async function serviceGetAllSessionsPatient(patientId, tenant_id, branch_id) {

    const sessionsPatient = await patientModel.getAllSessionsPatient(patientId, tenant_id, branch_id);

    return sessionsPatient;
}

async function serviceGetAllPaymentsPatient(patientId, tenant_id, branch_id) {

    const paymentssPatient = await patientModel.getAllPaymentsPatient(patientId, tenant_id, branch_id);

    return paymentssPatient;
}

async function serviceGetAllTreatmentPlansPatient(patientId, tenant_id, branch_id) {

    const TreatmentPlansPatient = await patientModel.getAllTreatmentPlansPatient(patientId, tenant_id, branch_id);

    return TreatmentPlansPatient;
}


export default {
    serviceCreatePatient,
    serviceGetAllPatients,
    serviceGetPatient,
    serviceUpdatePatient,
    serviceDeletePatient,
    searchPatientsService,
    serviceGetAllApptsPatient,
    serviceGetAllSessionsPatient,
    serviceGetAllPaymentsPatient,
    serviceGetAllTreatmentPlansPatient
}   