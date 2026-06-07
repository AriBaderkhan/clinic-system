import asyncWrap from "../utils/asyncWrap.js";
import worksService from "../services/worksService.js";

const createWork = asyncWrap(async (req, res) => {
    const { tenant_id,branch_id } = req.user;
    const work = await worksService.createWork(req.body, tenant_id, branch_id);
    res.status(201).json(work);
})


const getWorks = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const works = await worksService.getWorks(tenant_id, branch_id);
    res.status(200).json({data: works});
})

const getWorkById = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    const work = await worksService.getWorkById(workId, tenant_id, branch_id);
    res.status(200).json(work);
})

const updateWork = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    const work = await worksService.updateWork(workId, req.body, tenant_id, branch_id);
    res.status(200).json(work);
})


const deleteWork = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    const work = await worksService.deleteWork(workId, tenant_id, branch_id);
    res.status(200).json(work);
})



export default { createWork, getWorks, getWorkById,updateWork, deleteWork }