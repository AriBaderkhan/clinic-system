import permissionsModel from '../models/permissionsModel.js';
import subscriptionModel from '../models/subscriptionModel.js';
import tenantModel from '../models/tenantModel.js';
import appError from '../utils/appError.js';
import withTransaction from '../utils/withTransaction.js';

// Rules for changing a role's ticks in a branch:
//   * only branch roles can be changed (the owner role is fixed)
//   * nobody changes their OWN role (no giving yourself more)
//   * you can only give or take a tick you have yourself
//     (the owner-level role runs the whole clinic: it may give or take any branch tick)
//   * a tick that needs a plan feature can only be given when the plan has it
//   * "own / all" (patients, appointments, visits): you cannot give "all" if you only have "own"
// Custom roles (plan feature custom_roles):
//   * a clinic's own role; starts as a copy of another role, only with ticks the creator may give
//   * names unique in the clinic (built-in names cannot be reused); "treats patients" is fixed at creation
//   * only custom roles can be renamed / deleted; a role someone still holds cannot be deleted

// the caller must be working in a branch of their own clinic
const needBranch = async (tenant_id, branch_id) => {
    if (!branch_id) throw appError('BRANCH_REQUIRED', 'Open a branch first', 400);
    const ok = await tenantModel.branchBelongsToTenant(branch_id, tenant_id);
    if (!ok) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
}

// a built-in branch role, or one of THIS clinic's custom roles
const getEditableRole = async (role_id, tenant_id) => {
    const role = await permissionsModel.findRoleById(role_id, tenant_id);
    if (!role) throw appError('ROLE_NOT_FOUND', 'Role not found', 404);
    if (role.scope !== 'branch') throw appError('ROLE_PROTECTED', 'This role cannot be changed', 403);
    return role;
}

const scopeMap = (rows) => new Map(rows.map((r) => [r.permission_key, r.scope]));
const isOwner = (caller) => caller.role_scope === 'tenant';
const callerScope = (caller, key) => (!isOwner(caller) && caller.scopes?.[key] === 'own' ? 'own' : 'all');
// the ticks the caller may give or take
const givable = (caller, catalog) => new Set(isOwner(caller) ? catalog.map((p) => p.key) : caller.permissions);

// branch roles, and whether the caller may change each one
const getRoles = async (caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    const roles = await permissionsModel.getBranchRoles(caller.tenant_id);
    return roles.map((r) => ({ ...r, is_custom: !!r.tenant_id, can_edit: Number(r.id) !== Number(caller.role_id) }));
}

// every tick for one role in this branch: has it (and own/all), is it a default, can the caller change it
const getRole = async (role_id, caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    const role = await getEditableRole(role_id, caller.tenant_id);
    const [catalog, current, defaults, planFeatures] = await Promise.all([
        permissionsModel.getBranchCatalog(),
        permissionsModel.findBranchPermissions(role.id, caller.tenant_id, caller.branch_id),
        permissionsModel.findPermissionsByRole(role.id),
        subscriptionModel.getTenantFeatureCodes(caller.tenant_id),
    ]);
    const has = scopeMap(current);
    const isDefault = scopeMap(defaults);
    const mine = givable(caller, catalog);
    const plan = new Set(planFeatures);

    const permissions = catalog.map((p) => {
        let locked = null;
        if (!mine.has(p.key)) locked = 'not_yours';
        else if (p.feature_code && !plan.has(p.feature_code) && !has.has(p.key)) locked = 'plan';
        return {
            key: p.key, description: p.description, group_key: p.group_key, feature_code: p.feature_code,
            granted: has.has(p.key), is_default: isDefault.has(p.key), locked,
            has_scope: p.has_scope,
            scope: p.has_scope && has.has(p.key) ? has.get(p.key) : null,
            default_scope: p.has_scope && isDefault.has(p.key) ? isDefault.get(p.key) : null,
            max_scope: p.has_scope && mine.has(p.key) ? callerScope(caller, p.key) : null,
        };
    });
    return { role: { id: role.id, name: role.name, is_doctor: role.is_doctor, is_custom: !!role.tenant_id, can_edit: Number(role.id) !== Number(caller.role_id) }, permissions };
}

// save the full list of ticks (and own/all choices) for one role in this branch
const updateRole = async (role_id, keys, scopes, caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    const role = await getEditableRole(role_id, caller.tenant_id);
    if (Number(role.id) === Number(caller.role_id)) throw appError('CANNOT_EDIT_OWN_ROLE', 'You cannot change your own role', 403);

    const [catalog, planFeatures] = await Promise.all([
        permissionsModel.getBranchCatalog(),
        subscriptionModel.getTenantFeatureCodes(caller.tenant_id),
    ]);
    const byKey = new Map(catalog.map((p) => [p.key, p]));
    const unknown = keys.filter((k) => !byKey.has(k));
    if (unknown.length) throw appError('PERMISSION_UNKNOWN', `Unknown or owner-only permission: ${unknown.join(', ')}`, 400, { keys: unknown });

    const wanted = new Set(keys);
    const badScope = Object.keys(scopes).filter((k) => !byKey.get(k)?.has_scope || !wanted.has(k));
    if (badScope.length) throw appError('SCOPE_NOT_ALLOWED', `Own/all can only be set on a ticked view of patients, appointments or visits: ${badScope.join(', ')}`, 400, { keys: badScope });

    const mine = givable(caller, catalog);
    const plan = new Set(planFeatures);

    return withTransaction(async (client) => {
        await permissionsModel.lockBranchRole(caller.branch_id, role.id, client);
        const current = scopeMap(await permissionsModel.findBranchPermissions(role.id, caller.tenant_id, caller.branch_id, client));

        const added = keys.filter((k) => !current.has(k));
        const removed = [...current.keys()].filter((k) => !wanted.has(k) && byKey.has(k));

        // the own/all each kept or added tick should end with (new ticks start like the caller's own)
        const finalScope = (k) => scopes[k] ?? (current.has(k) ? current.get(k) : callerScope(caller, k));
        const rescoped = keys.filter((k) => byKey.get(k).has_scope && current.has(k) && current.get(k) !== finalScope(k));

        const notYours = [...added, ...removed, ...rescoped].filter((k) => !mine.has(k));
        if (notYours.length) throw appError('NOT_YOUR_PERMISSION', `You can only change what you can do yourself: ${notYours.join(', ')}`, 403, { keys: notYours });

        const wider = [...added, ...rescoped].filter((k) => byKey.get(k).has_scope && finalScope(k) === 'all' && callerScope(caller, k) === 'own');
        if (wider.length) throw appError('NOT_YOUR_PERMISSION', `You can only give "own" for: ${wider.join(', ')}`, 403, { keys: wider });

        const notInPlan = added.filter((k) => byKey.get(k).feature_code && !plan.has(byKey.get(k).feature_code));
        if (notInPlan.length) throw appError('FEATURE_NOT_INCLUDED', `Your plan does not include: ${notInPlan.join(', ')}`, 403, { keys: notInPlan });

        const ids = (list) => list.map((k) => byKey.get(k).id);
        const scopeOf = (list) => list.map((k) => (byKey.get(k).has_scope ? finalScope(k) : 'all'));
        if (added.length) {
            await permissionsModel.addBranchPermissions(caller.tenant_id, caller.branch_id, role.id, ids(added), scopeOf(added), caller.id, client);
            await permissionsModel.addChanges(caller.tenant_id, caller.branch_id, role.id, ids(added), 'granted', caller.id, client);
        }
        if (removed.length) {
            await permissionsModel.removeBranchPermissions(caller.tenant_id, caller.branch_id, role.id, ids(removed), client);
            await permissionsModel.addChanges(caller.tenant_id, caller.branch_id, role.id, ids(removed), 'removed', caller.id, client);
        }
        if (rescoped.length) {
            await permissionsModel.setBranchScopes(caller.tenant_id, caller.branch_id, role.id, ids(rescoped), scopeOf(rescoped), client);
            for (const scope of ['own', 'all']) {
                const list = rescoped.filter((k) => finalScope(k) === scope);
                if (list.length) await permissionsModel.addChanges(caller.tenant_id, caller.branch_id, role.id, ids(list), `scope_${scope}`, caller.id, client);
            }
        }
        return { role_id: role.id, added, removed, rescoped: rescoped.map((k) => ({ key: k, scope: finalScope(k) })) };
    });
}

// ---- custom roles ----

const needCustomRoles = async (tenant_id) => {
    const plan = await subscriptionModel.getTenantFeatureCodes(tenant_id);
    if (!plan.includes('custom_roles')) throw appError('FEATURE_NOT_INCLUDED', 'Your plan does not include: custom_roles', 403, { feature: 'custom_roles' });
}

const needFreeName = async (tenant_id, name, except_id = null) => {
    const same = await permissionsModel.findRoleByName(tenant_id, name);
    if (same && Number(same.id) !== Number(except_id)) throw appError('ROLE_NAME_TAKEN', 'A role with this name already exists', 409);
}

// only this clinic's own roles can be renamed or deleted
const getCustomRole = async (role_id, tenant_id) => {
    const role = await getEditableRole(role_id, tenant_id);
    if (!role.tenant_id) throw appError('ROLE_PROTECTED', 'Built-in roles cannot be renamed or deleted', 403);
    return role;
}

// new role = copy of base_role_id, keeping only the ticks the creator may give (and never a wider view)
const createRole = async ({ name, base_role_id, is_doctor }, caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    await needCustomRoles(caller.tenant_id);
    const base = await getEditableRole(base_role_id, caller.tenant_id);
    await needFreeName(caller.tenant_id, name);

    const catalog = await permissionsModel.getBranchCatalog();
    const mine = givable(caller, catalog);
    const allowedIds = catalog.filter((p) => mine.has(p.key)).map((p) => p.id);
    const ownOnlyIds = catalog.filter((p) => p.has_scope && callerScope(caller, p.key) === 'own').map((p) => p.id);

    return withTransaction(async (client) => {
        const role = await permissionsModel.createRole({ tenant_id: caller.tenant_id, name, is_doctor, created_by: caller.id }, client);
        await permissionsModel.copyRoleDefaults(base.id, role.id, allowedIds, client);
        await permissionsModel.copyRoleBranchTicks(caller.tenant_id, base.id, role.id, allowedIds, caller.id, client);
        if (ownOnlyIds.length) await permissionsModel.capScopesToOwn(caller.tenant_id, role.id, ownOnlyIds, client);
        return { ...role, is_custom: true, can_edit: true };
    });
}

const renameRole = async (role_id, name, caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    const role = await getCustomRole(role_id, caller.tenant_id);
    if (Number(role.id) === Number(caller.role_id)) throw appError('CANNOT_EDIT_OWN_ROLE', 'You cannot change your own role', 403);
    await needFreeName(caller.tenant_id, name, role.id);
    return permissionsModel.renameRole(role.id, caller.tenant_id, name);
}

const deleteRole = async (role_id, caller) => {
    await needBranch(caller.tenant_id, caller.branch_id);
    const role = await getCustomRole(role_id, caller.tenant_id);
    return withTransaction(async (client) => {
        if (await permissionsModel.roleInUse(role.id, client)) throw appError('ROLE_IN_USE', 'Move the people who have this role to another role first', 409);
        await permissionsModel.deleteRole(role.id, caller.tenant_id, client);
        return { id: role.id };
    });
}

export default { getRoles, getRole, updateRole, createRole, renameRole, deleteRole }
