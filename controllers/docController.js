import docService from '../services/docService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerGetAllDocs = asyncWrap(async (req, res) => {

    const result = await docService.serviceGetAllDocs();
    return res.status(200).json({ message: 'All Doctors are here\n', docs: result })
})


const controllerActiveTodayAppt = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;

    const appointments = await docService.serviceActiveTodayAppt(doc_id);
    return res.status(200).json({ data: appointments });
})

const controllerListApptsPerDoctor = asyncWrap(async (req, res) => {
    const { day, type, q } = req.query;
    const doc_id = req.user.id

    const appointments = await docService.serviceListApptsPerDoctor({
        day,
        type,
        search: q,
        doc_id
    });

    return res.status(200).json({
        message: "Appointments retrieved successfully",
        data: appointments
    });
})  // per doct

const controllerGetSessionByApptIdPerDoc = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const doc_id = req.user.id

    const result = await docService.serviceGetSessionByApptIdPerDoc(appointmentId, doc_id);
    return res.status(200).json({ message: `Session for appointment with id ${appointmentId} is here`, data: result });
})

export default {
    controllerGetAllDocs, controllerActiveTodayAppt,
    controllerListApptsPerDoctor, controllerGetSessionByApptIdPerDoc
}