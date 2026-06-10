import treatmentPlanService from '../services/treatmentPlanService.js';
import asyncWrap from '../utils/asyncWrap.js';

const controllerGetActivePlan = asyncWrap(async (req, res) => {
    const patientId = Number(req.query.patientId);
    const type = req.query.type;

    if (!patientId || !type) {
        return res.status(400).json({ message: 'patientId and type are required' });
    }
    const plan = await treatmentPlanService.serviceGetActivePlan(patientId, type, req.user.tenant_id, req.user.branch_id);
    return res.json({ data: plan });
})

const controllerGetSessionsForTp = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.serviceGetSessionsForTp(tpId, tenant_id, branch_id);

    return res.status(200).json({
        message: `All sessions for Treatment Plan with id ${tpId} is here\n`,
        data: result
    })
})

const controllerGetAllTreatmentPlansForSection = asyncWrap(async (req, res) => {
    const { isPaid, isCompleted, q, page, limit } = req.query;

    const parseBool = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
    };

    const { tenant_id, branch_id } = req.user;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);
    const { rows, total } = await treatmentPlanService.serviceGetAllTreatmentPlansForSection({
        isPaid: parseBool(isPaid),
        isCompleted: parseBool(isCompleted),
        search: q,
        page: safePage,
        limit: safeLimit,
    }, tenant_id, branch_id);

    return res.status(200).json({
        message: "Treatment Plans retrieved successfully",
        data: rows,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(total / safeLimit) || 1,
        }
    });
})

const controllerEditTp = asyncWrap(async (req, res) => {
    const { type, agreed_total, is_completed } = req.body;
    const tpId = Number(req.params.treatmentPlanId)
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.serviceEditTp(type, agreed_total, is_completed, tpId, tenant_id, branch_id);

    return res.status(200).json({
        message: `Edited the Treatment Plan with id ${tpId} successfully`,
        data: result
    })
})


const controllereDeleteTp = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.serviceDeleteTp(tpId, tenant_id, branch_id)
    return res.status(204).send()
})

const controllerUpdatePaidForTpSession = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId);
    const sessionId = Number(req.params.sessionId);
    const { amount } = req.body;

    const { tenant_id, branch_id } = req.user;
    const result = await treatmentPlanService.serviceUpdatePaidForTpSession(
        tpId,
        sessionId,
        amount,
        tenant_id,
        branch_id
    );

    return res.status(200).json({
        message: "Paid amount updated",
        data: result,
    });
});

export default {
    controllerGetActivePlan, controllerGetSessionsForTp, controllerGetAllTreatmentPlansForSection,
    controllerEditTp, controllereDeleteTp, controllerUpdatePaidForTpSession
}