import patientModel from '../models/patientModel.js';
import appError from '../utils/appError.js';
import { ownId } from '../utils/scope.js';

// only the patient's HOME branch edits or deletes the patient (a shared branch only reads + adds visits)
const mustBeHome = (patient, branch_id) => {
    if (Number(patient.branch_id) !== Number(branch_id)) {
        throw appError('PATIENT_NOT_HOME_BRANCH', "Only the patient's home branch can do this", 403);
    }
}

async function create(patientData, tenant_id, branch_id) {

    const { name, phone, extra_phones = [], age, gender, address, allergies, blood_type, chronic_diseases, referral_source, created_by } = patientData;
    const patient = await patientModel.createPatient(name, phone, extra_phones, age,gender, address, allergies, blood_type, chronic_diseases, referral_source, created_by, tenant_id, branch_id);

    if (!patient) throw appError('INSERT_FAILED', 'Failed to create patient', 500);
    return patient;
}

async function getAll({ q, page, limit, viewer }, tenant_id, branch_id) {
    // "own only" -> just the user's own patients
    const result = await patientModel.getAllPatients({ q, page, limit, own_id: ownId(viewer, 'view_patient') }, tenant_id, branch_id);
    return result;
}

async function getById(patientId, tenant_id, branch_id) {

    const patient = await patientModel.getPatient(patientId, tenant_id, branch_id);

    if (!patient) throw appError('FETCH_PATIENT_FAILED', 'No patient found', 404);
    return patient;
}

async function update(patientDataUpdate, tenant_id, branch_id) {
    const { patientId, fields, updatedBy } = patientDataUpdate;

    const thePatient = await patientModel.getPatient(patientId, tenant_id, branch_id)

    if (!thePatient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
    mustBeHome(thePatient, branch_id);

    const resultUpdate = await patientModel.updatePatient(patientId, fields, updatedBy, tenant_id, branch_id);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed', 500);

    return resultUpdate;
}

async function _delete(patientId, tenant_id, branch_id) {
    const thePatient = await patientModel.getPatient(patientId, tenant_id, branch_id);
    if (!thePatient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
    mustBeHome(thePatient, branch_id);
    try {
        const result = await patientModel.deletePatient(patientId, tenant_id, branch_id);
        if (!result) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
        return result;
    } catch (err) {
        if (err.code === '23503') {
            throw appError('PATIENT_HAS_RECORDS', 'Cannot delete this patient. They have existing appointments, sessions, or treatment plans.', 409);
        }
        throw err;
    }
}
// END OF CRUD

// for search available patient in creating appointment
async function search(q, tenant_id, branch_id, viewer) {
    return await patientModel.searchPatientsModel(q, tenant_id, branch_id, ownId(viewer, 'view_patient'));
}

// distinct referral sources for the dropdown (defaults + previously-added "Other")
async function getReferralSources(tenant_id) {
    return await patientModel.getReferralSources(tenant_id);
}


// The folder shows the FULL history (every branch), so first: is the patient open in THIS branch?
const visibleHere = async (patientId, tenant_id, branch_id) => {
    const patient = await patientModel.getPatient(patientId, tenant_id, branch_id);
    if (!patient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);
}

async function getAppointments(patientId, tenant_id, branch_id) {
    await visibleHere(patientId, tenant_id, branch_id);
    const apptsPatient = await patientModel.getAllApptsPatient(patientId, tenant_id);

    return apptsPatient;
}

async function getSessions(patientId, tenant_id, branch_id, limit = null) {
    await visibleHere(patientId, tenant_id, branch_id);
    const sessionsPatient = await patientModel.getAllSessionsPatient(patientId, tenant_id, limit);

    return sessionsPatient;
}

async function getPayments(patientId, tenant_id, branch_id) {
    await visibleHere(patientId, tenant_id, branch_id);
    const paymentssPatient = await patientModel.getAllPaymentsPatient(patientId, tenant_id);

    return paymentssPatient;
}

async function getTreatmentPlans(patientId, tenant_id, branch_id) {
    await visibleHere(patientId, tenant_id, branch_id);
    const TreatmentPlansPatient = await patientModel.getAllTreatmentPlansPatient(patientId, tenant_id);

    return TreatmentPlansPatient;
}


export default {
    create, getAll, getById, update, delete: _delete, search,
    getAppointments, getSessions, getPayments, getTreatmentPlans, getReferralSources
}