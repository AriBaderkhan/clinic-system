import appError from '../utils/appError.js';

import appointmentModel from '../models/appoinmentModel.js';
import patientModel from '../models/patientModel.js';
import doctorModel from '../models/docModel.js';
import sessionModel from '../models/sessionModel.js';
import dateRange from '../utils/dateRange.js';
import workCatalogModel from '../models/workCatalogModel.js';
import treatmentPlanModel from '../models/treatmentPlanModel.js';
import pool from '../db_connection.js';


async function serviceCreateAppointment(appointmentData) {
    const { patient_id, doctor_id, scheduled_start, created_by, appointment_type } = appointmentData;

    const patient = await patientModel.getPatient(patient_id);
    if (!patient) throw appError('PATIENT_NOT_FOUND', 'Patient not found', 404);

    const doctor = await doctorModel.getDoctorById(doctor_id);
    if (!doctor) throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);

    const slotTaken = await appointmentModel.isDoctorSlotTakenExact(doctor_id, scheduled_start);
    if (slotTaken) {
        throw appError(
            'APPOINTMENT_OVERLAP',
            'Doctor already has an appointment at this exact time',
            409
        );
    }

    if (appointment_type === 'normal') {
        const doctorIsFree = await appointmentModel.isDoctorAvailableInOneHourWindow(
            doctor_id,
            scheduled_start
        );
        if (!doctorIsFree) {
            throw appError(
                'APPOINTMENT_OVERLAP',
                'Doctor already booked in this time slot (minimum 1 hour between appointments)',
                409
            );
        }
    }

    const appointment = await appointmentModel.createAppointment(patient_id, doctor_id, scheduled_start, created_by, appointment_type);
    if (!appointment) throw appError('APPOINTMENT_CREATE_FAILED', 'Appointment create failed', 500);
    return appointment;
}

async function serviceGetAllAppointments() {

    const appointments = await appointmentModel.getAllAppointments();
    if (appointments.length === 0) throw appError('NO_APPOINTMENTS_FOUND', 'No appointments found', 404);
    return appointments;
}

async function serviceGetAppointment(appointmentId) {

    const appointment = await appointmentModel.getAppointment(appointmentId);
    if (!appointment) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
    return appointment;
}

async function serviceUpdateAppointment(appointmentDataForUpdate) {
    const { appointmentId, patient_id,doctor_id, scheduled_start, updatedBy } =
        appointmentDataForUpdate;

    // 1) Load current appointment
    const appt = await appointmentModel.getAppointment(appointmentId);
    if (!appt) {
        throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
    }

    // 2) Only allow editing scheduled / checked_in
    // if (!['scheduled', 'checked_in'].includes(appt.status)) {
    //     throw appError(
    //         'INVALID_APPOINTMENT_STATUS',
    //         'Only scheduled or checked_in appointments can be updated',
    //         400
    //     );
    // }

    // 3) Build fields object based on provided values
    const fields = {
        ...(patient_id ? { patient_id } : {}),
        ...(doctor_id ? { doctor_id } : {}),
        ...(scheduled_start ? { scheduled_start } : {}),
    };

    if (Object.keys(fields).length === 0) {
        throw appError('NO_FIELDS_TO_UPDATE', 'No fields provided to update', 400);
    }

    // 4) Determine final doctor + time after update
    const newDoctorId = doctor_id ?? appt.doctor_id;
    const newScheduledStart = scheduled_start ?? appt.scheduled_start;

    // 5) If doctor_id is changing, make sure doctor exists
    if (doctor_id) {
        const doctor = await doctorModel.getDoctorById(doctor_id);
        if (!doctor) {
            throw appError('DOCTOR_NOT_FOUND', 'Doctor not found', 404);
        }
    }

    // 6) Rule A: NEVER allow two appts at EXACT same time for same doctor
    const slotTaken = await appointmentModel.isDoctorSlotTakenExactForUpdate(
        newDoctorId,
        newScheduledStart,
        appointmentId
    );
    if (slotTaken) {
        throw appError(
            'APPOINTMENT_OVERLAP',
            'Doctor already has an appointment at this exact time',
            409
        );
    }

    // 7) Rule B: 1-hour spacing ONLY for normal appointments
    if (appt.appointment_type === 'normal') {
        const doctorIsFree = await appointmentModel.isDoctorAvailableInOneHourWindowForUpdate(
            newDoctorId,
            newScheduledStart,
            appointmentId
        );
        if (!doctorIsFree) {
            throw appError(
                'APPOINTMENT_OVERLAP',
                'Doctor already booked in this time slot (minimum 1 hour between appointments)',
                409
            );
        }
    }

    // 8) Perform the update
    const updated = await appointmentModel.updateAppointment(appointmentId, fields, updatedBy);
    if (!updated) {
        throw appError(
            'APPOINTMENT_UPDATE_FAILED',
            'Appointment update failed',
            500
        );
    }

    return updated;
}

async function serviceDeleteAppointment(appointmentId) {

    const deletedappointment = await appointmentModel.deleteAppointment(appointmentId)
    if (!deletedappointment) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);

    return deletedappointment;
}
// END OF CRUD

// STATUS CHANGING
async function serviceSetCheckIn(appointmentId, userId) {
    const appt = await appointmentModel.getAppointment(appointmentId);

    if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);


    if (appt.status !== 'scheduled') throw appError('INVALID_APPOINTMENT_STATUS', 'Only scheduled appointments can be checked in', 400);

    const updatedAppointmentStatus = await appointmentModel.setAppointmentCheckIn(appointmentId, userId);
    if (!updatedAppointmentStatus) throw appError('APPOINTMENT_CHECKIN_FAILED', 'Check-in failed', 500);
    return updatedAppointmentStatus;
}

async function serviceSetStart(appointmentId, userId) {
    const appt = await appointmentModel.getAppointment(appointmentId);

    if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);


    if (appt.status !== 'checked_in') throw appError('INVALID_APPOINTMENT_STATUS', 'Only checked_in appointments can be started', 400);

    const updatedAppointment = await appointmentModel.setAppointmentStart(appointmentId, userId);
    if (!updatedAppointment) throw appError('APPOINTMENT_START_FAILED', 'Appointment start failed', 500);
    return updatedAppointment;
}

// MAIN PART
// Its job is to:
// Close an in-progress appointment, 
// create a session, register all works, manage treatment plans, calculate totals,
async function serviceSetComplete({ appointmentId, doctorId, next_plan, notes, works, agreementTotals, planCompletion }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const appt = await appointmentModel.getAppointment(appointmentId, client);
        if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
        if (appt.status !== 'in_progress') throw appError('INVALID_APPOINTMENT_STATUS', 'Only in_progress appointments can be completed', 400);
        // if (appt.doctor_id !== doctorId) throw appError('FORBIDDEN', 'You are not allowed to complete this appointment');  // important 

        const createdSession = await sessionModel.createSession(appointmentId, next_plan, notes, doctorId, client);
        if (!createdSession) throw appError('SESSION_CREATE_FAILED', 'session create failed', 500);
        const sessionId = createdSession.id;


        // let minTotal = 0;
        // let grandTotal = 0;

        let normalMinTotal = 0;
        let normalGrandTotal = 0;

        let planMinTotal = 0;
        let planGrandTotal = 0;


        for (const w of works) {

            const { work_id, quantity, tooth_number } = w;

            const catalog = await workCatalogModel.getWorkById(work_id, client); // from work_catalog
            if (!catalog) throw appError('WORK_NOT_FOUND', 'Work not found', 404);


            const code = catalog.code.toLowerCase()



            // if works include the treatment plans
            // 🔹 ORTHO / IMPLANT / RCT
            let rawTreatmentPlanId = null;
            if (['ortho', 'implant', 'rct', 're_rct'].includes(code)) {
                let plan = await treatmentPlanModel.getActivePlan(
                    appt.patient_id,
                    code,
                    client
                );
           

                // first time ever
                if (!plan) {
                    const agreedTotal = Number(agreementTotals?.[code]); // ✅ pick only this type

                    if (!agreedTotal || agreedTotal <= 0) {
                        throw appError('AGREEMENT_TOTAL_REQUIRED', `${code} agreement total required`, 400);
                    }

                    // optional: enforce >= min_price from work_catalog
                    if (agreedTotal < Number(catalog.min_price)) {
                        throw appError('AGREEMENT_TOTAL_BELOW_MIN', `${code} agreement must be >= ${catalog.min_price}`, 400);
                    }

                    plan = await treatmentPlanModel.createPlan({
                        patientId: appt.patient_id,
                        type: code,
                        agreedTotal: agreedTotal,
                        createdBy: doctorId
                    }, client
                    );
                }
                rawTreatmentPlanId = plan.id;
                if (rawTreatmentPlanId && planCompletion?.[code] === true) {
                    await treatmentPlanModel.markCompleted(rawTreatmentPlanId, client);
                }

            }

            const minUnit = catalog.min_price;
            const unit = minUnit ; // for now

            const rowMin = minUnit * quantity;
            const rowTotal = unit * quantity;

            await sessionModel.createSessionWork({
                sessionId: createdSession.id,
                workId: work_id,
                quantity,
                toothNumber: tooth_number,
                minUnitPrice: minUnit,
                unitPrice: unit,
                totalMinPrice: rowMin,
                totalPrice: rowTotal,
                treatmentPlanId: rawTreatmentPlanId
            }, client
            );

            const isPlanWork = rawTreatmentPlanId !== null;
            if (isPlanWork) {
                planMinTotal += rowMin;
                planGrandTotal += rowTotal;
            } else {
                normalMinTotal += rowMin;
                normalGrandTotal += rowTotal;
            }

        }

        const min_total = normalMinTotal;
        const total = normalGrandTotal;
        const total_paid = 0;
        const is_paid = (normalGrandTotal <= 0);
        const updatedSessionWork = await sessionModel.updateSessionTotal({ min_total, total, total_paid, is_paid, sessionId }, client)
        if (!updatedSessionWork) throw appError('SESSION_UPDATE_FAILED', 'session Update failed', 500);


        const updatedAppointment = await appointmentModel.setAppointmentComplete(appointmentId, doctorId, client);
        if (!updatedAppointment) throw appError('APPOINTMENT_COMPLETE_FAILED', 'Appointment complete failed', 500);

        await client.query("COMMIT");

        return {
            appointment: updatedAppointment,
            session: createdSession,
            totals: {
                min_total: normalMinTotal,
                total: normalGrandTotal
            }
        }
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();

    }
}

async function serviceSetCancel(appointmentId, userId, cancel_reason) {
    const appt = await appointmentModel.getAppointment(appointmentId);

    if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);


    if (!['scheduled', 'checked_in', 'in_progress'].includes(appt.status)) throw appError('INVALID_APPOINTMENT_STATUS', 'Only scheduled or checked_in appointments can be cancelled', 400);

    const updatedAppointment = await appointmentModel.setAppointmentCancel(appointmentId, userId, cancel_reason);
    if (!updatedAppointment) throw appError('APPOINTMENT_CANCEL_FAILED', 'Appointment cancel failed', 500);
    return updatedAppointment;
}

async function serviceSetNoShow(appointmentId, userId, cancel_reason) {
    const appt = await appointmentModel.getAppointment(appointmentId);

    if (!appt) throw appError('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);


    if (!['scheduled'].includes(appt.status)) throw appError('INVALID_APPOINTMENT_STATUS', 'Only scheduled appointments can be marked as no_show', 400);

    const updatedAppointment = await appointmentModel.setAppointmentNoShow(appointmentId, userId, cancel_reason);
    if (!updatedAppointment) throw appError('APPOINTMENT_NO_SHOW_FAILED', 'Appointment no show failed', 500);
    return updatedAppointment;
}
// END OF STATUS CHANGING


// for filtters and searches by type and p.name, p.phone and d.name
async function serviceListAppointmentsWithFilters({ day, type, search }) {

    const range = day ? dateRange.getDateRange(day) : null;

    const appointments = await appointmentModel.findAppointmentsWithFilters({
        from: range ? range.from : null,
        to: range ? range.to : null,
        type: type,
        search: search,
    });

    return appointments;
}

// FOR DASHBOARD
async function serviceActiveTodayAppt() {

    const todayAppt = dateRange.getDateRange('today');

    if (!todayAppt || !todayAppt.from || !todayAppt.to) throw appError('ACTIVE_TODAY_APPT', 'Could not compute date range for today', 400);

    const appointments = await appointmentModel.activeTodayAppt({
        from: todayAppt ? todayAppt.from : null,
        to: todayAppt ? todayAppt.to : null,
    });

    return appointments;
}

async function serviceGetSessionByApptId(appointmentId) {

    const sessionForAppt = await appointmentModel.getSessionByApptId(appointmentId);
    if (!sessionForAppt) throw appError('SESSION_FOR_APPOINTMENT_NOT_FOUND', 'Session for appointment not found', 404);
    return sessionForAppt;
}
export default {
    serviceCreateAppointment, serviceGetAllAppointments, serviceGetAppointment, serviceDeleteAppointment, serviceUpdateAppointment,
    serviceSetCheckIn, serviceSetStart, serviceSetComplete, serviceSetCancel, serviceSetNoShow, serviceListAppointmentsWithFilters,
    serviceActiveTodayAppt, serviceGetSessionByApptId
}