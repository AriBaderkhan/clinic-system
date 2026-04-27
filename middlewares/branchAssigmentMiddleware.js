import branchModel from '../models/branchModel.js';
import userBranchRoleModel from '../models/userBranchRoleModel.js';
import asyncWrap from '../utils/asyncWrap.js';

const branchAssigmentMiddleware = asyncWrap(async (req, res, next) => {
    const { id, tenant_id, branch_id } = req.user;
    if (!branch_id) return next();
    const assignment = await userBranchRoleModel.findUserByIdForMiddleware(id, tenant_id, branch_id);
    if (!assignment) throw appError('ASSIGNMENT_NOT_FOUND', 'Assignment not found', 404);
    if (!assignment.is_active) throw appError('ASSIGNMENT_NOT_ACTIVE', 'Assignment not active', 403);

    const branch = await branchModel.findBranchById(branch_id);
    if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
    if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);

    next();
})

export default branchAssigmentMiddleware;

