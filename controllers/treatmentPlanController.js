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

const controllerGetAllTreatmentPlansForSection = asyncWrap(async (req, res) => {
    const { isPaid, isCompleted, q } = req.query;

    const parseBool = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined; // or throw error if you want strict
    };

    const result = await treatmentPlanService.serviceGetAllTreatmentPlansForSection({
        isPaid: parseBool(isPaid),
        isCompleted: parseBool(isCompleted),
        search: q,
    });

    return res.status(200).json({
        message: "Treatment Plans retrieved successfully",
        data: result
    });
})

const controllerEditTp = asyncWrap(async (req, res) => {
    const {type , agreed_total, is_completed} = req.body;
    const tpId = Number(req.params.treatmentPlanId)

    const result = await treatmentPlanService.serviceEditTp(type, agreed_total,is_completed, tpId);

    return res.status(200).json({
        message: `Edited the Treatment Plan with id ${tpId} successfully`,
        data: result
    })
})


const controllereDeleteTp = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)

    const result = await treatmentPlanService.serviceDeleteTp(tpId)
    return res.status(204).send()
})

const controllerUpdatePaidForTpSession = asyncWrap(async (req, res) => {
  const tpId = Number(req.params.treatmentPlanId);
  const sessionId = Number(req.params.sessionId);
  const { amount } = req.body;

  const result = await treatmentPlanService.serviceUpdatePaidForTpSession(
    tpId,
    sessionId,
    amount
  );

  return res.status(200).json({
    message: "Paid amount updated",
    data: result,
  });
});

export default { controllerGetActivePlan, controllerGetSessionsForTp, controllerGetAllTreatmentPlansForSection,
    controllerEditTp,  controllereDeleteTp, controllerUpdatePaidForTpSession
 }