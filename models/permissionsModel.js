import pool from "../db_connection.js";

// the role's DEFAULT ticks (owner role, and what a new branch starts with)
async function findPermissionsByRole(role_id, client = pool) {
    const query = `
    SELECT
    p.key AS permission_key,
    rp.scope
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = $1`;
    const values = [role_id];
    const { rows } = await client.query(query, values);
    return rows;
}

// the role's ticks in ONE branch
async function findBranchPermissions(role_id, tenant_id, branch_id, client = pool) {
    const query = `
    SELECT p.key AS permission_key, brp.scope
      FROM branch_role_permissions brp
      JOIN permissions p ON p.id = brp.permission_id
     WHERE brp.role_id = $1 AND brp.tenant_id = $2 AND brp.branch_id = $3`;
    const { rows } = await client.query(query, [role_id, tenant_id, branch_id]);
    return rows;
}

// new branch: copy the defaults of every branch role (built-in + this clinic's custom roles)
async function copyDefaultsToBranch(tenant_id, branch_id, client = pool) {
    const query = `
    INSERT INTO branch_role_permissions (tenant_id, branch_id, role_id, permission_id, scope)
    SELECT $1, $2, rp.role_id, rp.permission_id, rp.scope
      FROM role_permissions rp
      JOIN roles r       ON r.id = rp.role_id AND r.scope = 'branch' AND (r.tenant_id IS NULL OR r.tenant_id = $1)
      JOIN permissions p ON p.id = rp.permission_id AND p.scope = 'branch'
    ON CONFLICT DO NOTHING`;
    await client.query(query, [tenant_id, branch_id]);
}

// a built-in role, or a custom role of THIS clinic (another clinic's role is "not found")
async function findRoleById(role_id, tenant_id) {
    const query = `SELECT id, name, scope, is_doctor, tenant_id FROM roles WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`;
    const { rows } = await pool.query(query, [role_id, tenant_id]);
    return rows[0] || null;
}

// built-in branch roles first, then this clinic's custom roles
async function getBranchRoles(tenant_id) {
    const query = `
    SELECT id, name, is_doctor, tenant_id
      FROM roles
     WHERE scope = 'branch' AND (tenant_id IS NULL OR tenant_id = $1)
     ORDER BY tenant_id NULLS FIRST, id`;
    const { rows } = await pool.query(query, [tenant_id]);
    return rows;
}

// same name (any case) among built-in roles and this clinic's roles
async function findRoleByName(tenant_id, name) {
    const query = `SELECT id FROM roles WHERE lower(name) = lower($2) AND (tenant_id IS NULL OR tenant_id = $1)`;
    const { rows } = await pool.query(query, [tenant_id, name]);
    return rows[0] || null;
}

async function createRole({ tenant_id, name, is_doctor, created_by }, client) {
    const query = `
    INSERT INTO roles (tenant_id, name, scope, is_doctor, created_by)
    VALUES ($1, $2, 'branch', $3, $4)
    RETURNING id, name, is_doctor, tenant_id`;
    const { rows } = await client.query(query, [tenant_id, name, is_doctor, created_by]);
    return rows[0];
}

async function renameRole(role_id, tenant_id, name) {
    const query = `UPDATE roles SET name = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING id, name, is_doctor, tenant_id`;
    const { rows } = await pool.query(query, [role_id, tenant_id, name]);
    return rows[0] || null;
}

async function deleteRole(role_id, tenant_id, client) {
    const query = `DELETE FROM roles WHERE id = $1 AND tenant_id = $2 RETURNING id`;
    const { rows } = await client.query(query, [role_id, tenant_id]);
    return rows[0] || null;
}

// is anyone (active or not) holding the role?
async function roleInUse(role_id, client = pool) {
    const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM user_branch_roles WHERE role_id = $1) AS used`, [role_id]);
    return rows[0].used;
}

// new custom role = a copy of another role, only with the given ticks (permission ids)
async function copyRoleDefaults(from_role_id, to_role_id, permission_ids, client) {
    const query = `
    INSERT INTO role_permissions (role_id, permission_id, scope)
    SELECT $2, rp.permission_id, rp.scope FROM role_permissions rp
     WHERE rp.role_id = $1 AND rp.permission_id = ANY($3::bigint[])
    ON CONFLICT DO NOTHING`;
    await client.query(query, [from_role_id, to_role_id, permission_ids]);
}

async function copyRoleBranchTicks(tenant_id, from_role_id, to_role_id, permission_ids, granted_by, client) {
    const query = `
    INSERT INTO branch_role_permissions (tenant_id, branch_id, role_id, permission_id, scope, granted_by)
    SELECT $1, brp.branch_id, $3, brp.permission_id, brp.scope, $5 FROM branch_role_permissions brp
     WHERE brp.tenant_id = $1 AND brp.role_id = $2 AND brp.permission_id = ANY($4::bigint[])
    ON CONFLICT DO NOTHING`;
    await client.query(query, [tenant_id, from_role_id, to_role_id, permission_ids, granted_by]);
}

// the copy may not see more than its creator: these ticks become "own only"
async function capScopesToOwn(tenant_id, role_id, permission_ids, client) {
    await client.query(`UPDATE branch_role_permissions SET scope = 'own' WHERE tenant_id = $1 AND role_id = $2 AND permission_id = ANY($3::bigint[])`, [tenant_id, role_id, permission_ids]);
    await client.query(`UPDATE role_permissions SET scope = 'own' WHERE role_id = $1 AND permission_id = ANY($2::bigint[])`, [role_id, permission_ids]);
}

// every tick a branch role can hold, in screen order
async function getBranchCatalog() {
    const query = `
    SELECT id, key, description, group_key, feature_code, has_scope
      FROM permissions
     WHERE scope = 'branch'
     ORDER BY group_key, sort_order, key`;
    const { rows } = await pool.query(query);
    return rows;
}

// one save at a time per branch + role
async function lockBranchRole(branch_id, role_id, client) {
    await client.query(`SELECT pg_advisory_xact_lock($1::int, $2::int)`, [branch_id, role_id]);
}

// permission_ids[i] is added with scopes[i] ('own' | 'all')
async function addBranchPermissions(tenant_id, branch_id, role_id, permission_ids, scopes, granted_by, client) {
    const query = `
    INSERT INTO branch_role_permissions (tenant_id, branch_id, role_id, permission_id, scope, granted_by)
    SELECT $1, $2, $3, x.permission_id, x.scope, $6
      FROM unnest($4::bigint[], $5::text[]) AS x(permission_id, scope)
    ON CONFLICT DO NOTHING`;
    await client.query(query, [tenant_id, branch_id, role_id, permission_ids, scopes, granted_by]);
}

async function setBranchScopes(tenant_id, branch_id, role_id, permission_ids, scopes, client) {
    const query = `
    UPDATE branch_role_permissions brp
       SET scope = x.scope
      FROM unnest($4::bigint[], $5::text[]) AS x(permission_id, scope)
     WHERE brp.tenant_id = $1 AND brp.branch_id = $2 AND brp.role_id = $3 AND brp.permission_id = x.permission_id`;
    await client.query(query, [tenant_id, branch_id, role_id, permission_ids, scopes]);
}

async function removeBranchPermissions(tenant_id, branch_id, role_id, permission_ids, client) {
    const query = `
    DELETE FROM branch_role_permissions
     WHERE tenant_id = $1 AND branch_id = $2 AND role_id = $3 AND permission_id = ANY($4::bigint[])`;
    await client.query(query, [tenant_id, branch_id, role_id, permission_ids]);
}

async function addChanges(tenant_id, branch_id, role_id, permission_ids, action, changed_by, client) {
    const query = `
    INSERT INTO permission_changes (tenant_id, branch_id, role_id, permission_id, action, changed_by)
    SELECT $1, $2, $3, unnest($4::bigint[]), $5, $6`;
    await client.query(query, [tenant_id, branch_id, role_id, permission_ids, action, changed_by]);
}

export default {
    findPermissionsByRole, findBranchPermissions, copyDefaultsToBranch,
    findRoleById, getBranchRoles, getBranchCatalog,
    findRoleByName, createRole, renameRole, deleteRole, roleInUse, copyRoleDefaults, copyRoleBranchTicks, capScopesToOwn,
    lockBranchRole, addBranchPermissions, setBranchScopes, removeBranchPermissions, addChanges,
}
