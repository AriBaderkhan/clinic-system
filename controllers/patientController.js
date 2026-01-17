import patientService from '../services/patientService.js';
import asyncWrap from '../utils/asyncWrap.js';

const controllerCreatePatient = asyncWrap(async (req, res) => {
    const { name, phone, age, gender, address } = req.body;
    const created_by = req.user.id;

    const patientData = { name, phone, age, gender, address, created_by }


    const result = await patientService.serviceCreatePatient(patientData);

    return res.status(201).json({ message: `Patient Added succesfully`, data: result });
})

const controllerGetAllPatients = asyncWrap(async (req, res) => {
    const { q} = req.query;
    const result = await patientService.serviceGetAllPatients(q);
    return res.status(200).json({ message: 'All Patients are here\n', patients: result })
})

const controllerGetPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const result = await patientService.serviceGetPatient(patientId);
    return res.status(200).json({ message: `Patient with id ${patientId} is here\n`, patient: result })
})


const controllerUpdatePatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId);
    const updatedBy = req.user.id;
    const fields = req.body;

    const patientDataUpdate = { patientId, updatedBy, fields }

    const result = await patientService.serviceUpdatePatient(patientDataUpdate);
    return res.status(200).json({ message: `Patient with id ${patientId} updated successfully`, updatedPatient: result });
})

const controllerDeletePatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const deletedPatient = await patientService.serviceDeletePatient(patientId)
    return res.status(204).send()
})

// for search available patient in creating appointment
const controllerSearchPatients = asyncWrap(async (req, res) => {
    const q = (req.query.q || "").trim();

    // if (!q || q.length < 2) {
    //     return res.json([]); // no query or too short
    // }
    const patients = await patientService.searchPatientsService(q);
    return res.json(patients); // simple array
})

const controllerGetAllApptsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const result = await patientService.serviceGetAllApptsPatient(patientId);
    return res.status(200).json({ message: `All Appointments for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllSessionsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const result = await patientService.serviceGetAllSessionsPatient(patientId);
    return res.status(200).json({ message: `All Sessions for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllPaymentsPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const result = await patientService.serviceGetAllPaymentsPatient(patientId);
    return res.status(200).json({ message: `All Payments for Patient with id ${patientId} is here\n`, data: result })
})

const controllerGetAllTreatmentPlansPatient = asyncWrap(async (req, res) => {
    const patientId = Number(req.params.patientId)

    const result = await patientService.serviceGetAllTreatmentPlansPatient(patientId);
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