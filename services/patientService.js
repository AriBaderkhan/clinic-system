import patientModel from '../models/patientModel.js';
import appError from '../utils/appError.js';

async function serviceCreatePatient(patientData) {

    const { name, phone, age, gender, address, created_by } = patientData;
    const patient = await patientModel.createPatient(name, phone, age, gender, address, created_by);
    
    if (!patient) throw appError('INSERT_FAILED', 'Failed to create patient',500);
    console.log('done service in service')
    return patient;
}

async function serviceGetAllPatients(q) {
    const patients = await patientModel.getAllPatients(q);

    if (!patients || patients.length === 0) return [];
    return patients;
}

async function serviceGetPatient(patientId) {

    const patient = await patientModel.getPatient(patientId);

    if (!patient) throw appError('FETCH_PATIENT_FAILED', 'No patient found',404);
    return patient;
}

async function serviceUpdatePatient(patientDataUpdate) {
    const { patientId, fields, updatedBy } = patientDataUpdate;

    const thePatient = await patientModel.getPatient(patientId)

    if (!thePatient) throw appError('PATIENT_NOT_FOUND', 'Patient not found',404);

    const resultUpdate = await patientModel.updatePatient(patientId, fields, updatedBy);
    if (!resultUpdate) throw appError('UPDATE_FAILED', 'Update operation failed',500);

    return resultUpdate;
}

async function serviceDeletePatient(patientId) {

    const result = await patientModel.deletePatient(patientId)

    if (!result) throw appError('DELETE_FAILED', 'Delete operation failed',500);
    return result;
}
// END OF CRUD

// for search available patient in creating appointment
async function searchPatientsService(q) {
  return await patientModel.searchPatientsModel(q);
}


async function serviceGetAllApptsPatient(patientId) {

    const apptsPatient = await patientModel.getAllApptsPatient(patientId);

    return apptsPatient;
}

async function serviceGetAllSessionsPatient(patientId) {

    const sessionsPatient = await patientModel.getAllSessionsPatient(patientId);

    return sessionsPatient;
}

async function serviceGetAllPaymentsPatient(patientId) {

    const paymentssPatient = await patientModel.getAllPaymentsPatient(patientId);

    return paymentssPatient;
}

async function serviceGetAllTreatmentPlansPatient(patientId) {

    const TreatmentPlansPatient = await patientModel.getAllTreatmentPlansPatient(patientId);

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