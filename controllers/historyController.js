import historyService from '../services/historyService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerPaymentsHistory = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await historyService.serviceGetPaymentsHistory(tenant_id, branch_id);
    res.status(200).json({ message: 'Payment History', data: result })
})

const controllerGetSessionDetails = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await historyService.serviceGetSessionDetails(session_id, tenant_id, branch_id);
    res.status(200).json({ message: 'Session Detail', data: result })
})

export default { controllerPaymentsHistory, controllerGetSessionDetails }