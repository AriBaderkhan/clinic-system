import appointmentService from '../services/appointmentService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerCreateAppointment = asyncWrap(async (req, res) => {
    const { patient_id, doctor_id, scheduled_start, appointment_type } = req.body;
    const created_by = req.user.id;

    const appointmentData = { patient_id, doctor_id, scheduled_start, created_by, appointment_type }

    const result = await appointmentService.serviceCreateAppointment(appointmentData)
    return res.status(201).json({ message: 'Appointment created', appointment: result });
})

const controllerGetAllAppointments = asyncWrap(async (req, res) => {

    const result = await appointmentService.serviceGetAllAppointments()
    res.status(200).json({ message: 'All Appointments are here', appointments: result });
})

const controllerGetAppointment = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)

    const result = await appointmentService.serviceGetAppointment(appointmentId);
    return res.status(200).json({ message: `Appointment with id ${appointmentId} is here`, appointment: result });
})

const controllerUpdateAppointment = asyncWrap(async (req, res) => {
    const { patient_id,doctor_id, scheduled_start } = req.body;
    const appointmentId = Number(req.params.appointmentId);
    const updatedBy = req.user.id;

    const appointmentDataForUpdate = { appointmentId, patient_id,doctor_id, scheduled_start, updatedBy }

    const result = await appointmentService.serviceUpdateAppointment(appointmentDataForUpdate)
    res.status(200).json({ message: `Appointment with id ${appointmentId} updated successfully`, appointment: result });
})

const controllerDeleteAppointment = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)

    const result = await appointmentService.serviceDeleteAppointment(appointmentId)
    return res.status(200).json({ message: `Appointment with id ${appointmentId} deleted successfully`, appointment: result });
})
// END OF CRUD 

// STATUS CHANGING
const controllerSetCheckedIn = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;

    const result = await appointmentService.serviceSetCheckIn(appointmentId, userId);
    res.status(200).json({ message: `Appointment with id ${appointmentId} checked-in successfully`, appointment: result });
})

const controllerSetStart = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;

    const result = await appointmentService.serviceSetStart(appointmentId, userId);
    return res.status(200).json({ message: 'Started', appointment: result });
})
// MAIN PART
const controllerSetComplete = asyncWrap(async (req, res) => {
    const { next_plan, notes, works, agreementTotals, planCompletion } = req.body;
    const appointmentId = Number(req.params.appointmentId);
    const userId = req.user.id;

    const result = await appointmentService.serviceSetComplete({ appointmentId, doctorId: userId, next_plan, notes, works, agreementTotals, planCompletion });
    return res.status(200).json({ message: 'Completed ', data: result });
})

const controllerSetCancel = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId);
    const { cancel_reason } = req.body;
    const userId = req.user.id;

    const result = await appointmentService.serviceSetCancel(appointmentId, userId, cancel_reason);
    return res.status(200).json({ message: 'Cancelled', appointment: result });
})

const controllerSetNoShow = asyncWrap(async (req, res) => {

    const appointmentId = Number(req.params.appointmentId);
    const { cancel_reason } = req.body;
    const userId = req.user.id;

    const result = await appointmentService.serviceSetNoShow(appointmentId, userId, cancel_reason);
    return res.status(200).json({ message: 'Marked no_show', appointment: result });
})
// END OF STATUS CHANGING

// for filtters and searches by type and p.name, p.phone and d.name
const controllerListAppointments = asyncWrap(async (req, res) => {
    const { day, type, q } = req.query;

    const appointments = await appointmentService.serviceListAppointmentsWithFilters({
        day,
        type,
        search: q,
    });

    return res.status(200).json({
        message: "Appointments retrieved successfully",
        data: appointments
    });
}) 

// for dashbord
const controllerActiveTodayAppt = asyncWrap(async (req, res) => {

    const appointments = await appointmentService.serviceActiveTodayAppt();
    return res.status(200).json({
        message: "Appointments for today active successfully",
        data: appointments
    });
})

const controllerGetSessionByApptId = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)

    const result = await appointmentService.serviceGetSessionByApptId(appointmentId);
    return res.status(200).json({ message: `Session for appointment with id ${appointmentId} is here`, data: result });
})

export default {
    controllerCreateAppointment,
    controllerGetAllAppointments,
    controllerGetAppointment,
    controllerDeleteAppointment,
    controllerUpdateAppointment,
    controllerSetCheckedIn,
    controllerSetStart,
    controllerSetComplete,
    controllerSetCancel,
    controllerSetNoShow,
    controllerListAppointments,
    controllerActiveTodayAppt,
    controllerGetSessionByApptId
};