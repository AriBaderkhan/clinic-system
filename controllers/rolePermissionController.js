import asyncWrap from "../utils/asyncWrap.js";
import rolePermissionService from "../services/rolePermissionService.js";

const caller = (req) => {
    const { id, role_id, role_scope, tenant_id, branch_id, permissions, scopes } = req.user;
    return { id, role_id, role_scope, tenant_id, branch_id, permissions, scopes };
}

const getRoles = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.getRoles(caller(req));
    res.status(200).json({ ok: true, data: result });
})

const getRole = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.getRole(Number(req.params.roleId), caller(req));
    res.status(200).json({ ok: true, data: result });
})

const updateRole = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.updateRole(Number(req.params.roleId), req.body.permissions, req.body.scopes, caller(req));
    res.status(200).json({ ok: true, data: result });
})

const createRole = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.createRole(req.body, caller(req));
    res.status(201).json({ ok: true, data: result });
})

const renameRole = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.renameRole(Number(req.params.roleId), req.body.name, caller(req));
    res.status(200).json({ ok: true, data: result });
})

const deleteRole = asyncWrap(async (req, res) => {
    const result = await rolePermissionService.deleteRole(Number(req.params.roleId), caller(req));
    res.status(200).json({ ok: true, data: result });
})

export default { getRoles, getRole, updateRole, createRole, renameRole, deleteRole }
