import asyncWrap from "../utils/asyncWrap.js";
import discountService from "../services/discountService.js";

const create = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const result = await discountService.create(req.body, tenant_id, branch_id);
  res.status(201).json({ ok: true, data: result });
});

const getAll = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const result = await discountService.getAll(tenant_id, branch_id);
  res.status(200).json({ ok: true, data: result });
});

const update = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const { discountId } = req.params;
  const result = await discountService.update(discountId, req.body, tenant_id, branch_id);
  res.status(200).json({ ok: true, data: result });
});

const _delete = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const { discountId } = req.params;
  await discountService.delete(discountId, tenant_id, branch_id);
  res.status(200).json({ ok: true });
});

export default { create, getAll, update, delete: _delete };
