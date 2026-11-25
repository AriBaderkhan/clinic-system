import discountModel from "../models/discountModel.js";
import appError from "../utils/appError.js";

const create = async ({ name, type, value }, tenant_id, branch_id) => {
  const discount = await discountModel.createDiscount(name.trim(), type, value, tenant_id, branch_id);
  if (!discount) throw appError('DISCOUNT_CREATION_FAILED', 'Failed to create discount', 500);
  return discount;
};

const getAll = async (tenant_id, branch_id) => {
  return discountModel.getDiscounts(tenant_id, branch_id);
};

const update = async (discountId, fields, tenant_id, branch_id) => {
  const clean = {};
  if (fields.name !== undefined) clean.name = fields.name.trim();
  if (fields.type !== undefined) clean.type = fields.type;
  if (fields.value !== undefined) clean.value = fields.value;
  if (Object.keys(clean).length === 0) throw appError('NOTHING_TO_UPDATE', 'No fields to update', 400);

  // a deleted discount can't be edited
  const current = await discountModel.getDiscountById(discountId, tenant_id, branch_id);
  if (!current || !current.is_active) throw appError('DISCOUNT_NOT_FOUND', 'Discount not found', 404);
  // the rule is checked on the discount AFTER the edit (type and value together): percent is 0-100
  const finalType = clean.type ?? current.type;
  const finalValue = Number(clean.value ?? current.value);
  if (finalType === 'percent' && finalValue > 100) {
    throw appError('DISCOUNT_PERCENT_OVER_100', 'A percent discount cannot be more than 100%', 400);
  }

  const discount = await discountModel.updateDiscount(discountId, clean, tenant_id, branch_id);
  if (!discount) throw appError('DISCOUNT_NOT_FOUND', 'Discount not found', 404);
  return discount;
};

const _delete = async (discountId, tenant_id, branch_id) => {
  const discount = await discountModel.deleteDiscount(discountId, tenant_id, branch_id);
  if (!discount) throw appError('DISCOUNT_NOT_FOUND', 'Discount not found', 404);
  return discount;
};

export default { create, getAll, update, delete: _delete };
