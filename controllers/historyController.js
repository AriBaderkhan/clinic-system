import historyService from '../services/historyService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerPaymentsHistory = asyncWrap(async (req, res) => {

    const result = await historyService.serviceGetPaymentsHistory();
    res.status(200).json({ message: 'Payment History', data: result })
})

const controllerGetSessionDetails = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);

    const result = await historyService.serviceGetSessionDetails(session_id);
    res.status(200).json({ message: 'Session Detail', data: result })
})

export default { controllerPaymentsHistory, controllerGetSessionDetails }