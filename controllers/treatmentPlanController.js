import treatmentPlanService from '../services/treatmentPlanService.js';
import asyncWrap from '../utils/asyncWrap.js';

const controllerGetActivePlan = asyncWrap(async (req, res) => {
    const patientId = Number(req.query.patientId);
    const type = req.query.type;

    if (!patientId || !type) {
        return res.status(400).json({ message: 'patientId and type are required' });
    }
    const plan = await treatmentPlanService.serviceGetActivePlan(patientId, type);
    return res.json({ data: plan });
})

const controllerGetSessionsForTp = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)

    const result = await treatmentPlanService.serviceGetSessionsForTp(tpId);

    return res.status(200).json({
        message: `All sessions for Treatment Plan with id ${tpId} is here\n`,
        data: result
    })


})
export default { controllerGetActivePlan, controllerGetSessionsForTp }