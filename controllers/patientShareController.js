import asyncWrap from "../utils/asyncWrap.js";
import patientShareService from "../services/patientShareService.js";

const caller = (req) => {
    const { id, tenant_id, branch_id } = req.user;
    return { id, tenant_id, branch_id };
}

const getShares = asyncWrap(async (req, res) => {
    const result = await patientShareService.getShares(Number(req.params.patientId), caller(req));
    res.status(200).json({ ok: true, data: result });
})

const share = asyncWrap(async (req, res) => {
    const result = await patientShareService.share(Number(req.params.patientId), req.body.branch_id, caller(req));
    res.status(201).json({ ok: true, data: result });
})

const unshare = asyncWrap(async (req, res) => {
    const result = await patientShareService.unshare(Number(req.params.patientId), Number(req.params.branchId), caller(req));
    res.status(200).json({ ok: true, data: result });
})

const phoneCheck = asyncWrap(async (req, res) => {
    const result = await patientShareService.phoneElsewhere(req.query.phone, caller(req));
    res.status(200).json({ ok: true, data: result });
})

export default { getShares, share, unshare, phoneCheck }
