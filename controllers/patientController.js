import patientService from '../services/patientService.js';
import asyncWrap from '../utils/asyncWrap.js';

const controllerCreatePatient = asyncWrap(async (req, res) => {
    const { name, phone, age, gender, address } = req.body;
    const created_by = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const patientData = { name, phone, age, gender, address, created_by }


    const result = await patientService.serviceCreatePatient(patientData, tenant_id, branch_id);

    return res.status(201).json({ message: `Patient Added succesfully`, data: result });
})

const controllerGetAllPatients = asyncWrap(async (req, res) => {
    const { q } = req.query;
    const { tenant_id, branch_id } = req.user;
    const result = await patientService.serviceGetAllPatients(q, tenant_id, branch_id);
    return res.status(200).json({ message: 'All Patients are here\n', patients: result })
})

const controllerGetPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.serviceGetPatient(patientId, tenant_id, branch_id);
    return res.status(200).json({ message: `Patient with id ${patientId} is here\n`, patient: result })
})


const controllerUpdatePatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId);
    const updatedBy = req.user.id;
    const fields = req.body;
    const { tenant_id, branch_id } = req.user;

    const patientDataUpdate = { patientId, updatedBy, fields }

    const result = await patientService.serviceUpdatePatient(patientDataUpdate, tenant_id, branch_id);
    return res.status(200).json({ message: `Patient with id ${patientId} updated successfully`, updatedPatient: result });
})

const controllerDeletePatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const deletedPatient = await patientService.serviceDeletePatient(patientId, tenant_id, branch_id)
    return res.status(204).send()
})

// for search available patient in creating appointment
const controllerSearchPatients = asyncWrap(async (req, res) => {
    const q = (req.query.q || "").trim();
    const { tenant_id, branch_id } = req.user;

    // if (!q || q.length < 2) {
    //     return res.json([]); // no query or too short
    // }
    const patients = await patientService.searchPatientsService(q, tenant_id, branch_id);
    return res.json(patients); // simple array
})

const controllerGetAllApptsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.serviceGetAllApptsPatient(patientId, tenant_id, branch_id);
    return res.status(200).json({ message: `All Appointments for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllSessionsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.serviceGetAllSessionsPatient(patientId, tenant_id, branch_id);
    return res.status(200).json({ message: `All Sessions for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllPaymentsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.serviceGetAllPaymentsPatient(patientId, tenant_id, branch_id);
    return res.status(200).json({ message: `All Payments for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllTreatmentPlansPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)
    const { tenant_id, branch_id } = req.user;

    const result = await patientService.serviceGetAllTreatmentPlansPatient(patientId, tenant_id, branch_id);
    return res.status(200).json({ message: `All Treatment Plans for Patient with id ${patientId} is here\n`, data: result })
})


export default {
    controllerCreatePatient,
    controllerGetAllPatients,
    controllerGetPatient,
    controllerUpdatePatient,
    controllerDeletePatient,
    controllerSearchPatients,

    controllerGetAllApptsPatient,
    controllerGetAllSessionsPatient,
    controllerGetAllPaymentsPatient,
    controllerGetAllTreatmentPlansPatient
}