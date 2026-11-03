import pool from '../db_connection.js';

async function createUser(email, hashedPassword, tenant_id, is_active) {
    const query = `INSERT INTO users (email,password,tenant_id,is_active) VALUES ($1,$2,$3,$4) RETURNING id`;
    const values = [email, hashedPassword, tenant_id, is_active];
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
}

async function checkRoleIfDoc(role_id, client = pool) {
    // the role's flags (is_doctor) and owner clinic (NULL = built-in)
    const { rows } = await client.query(
        'SELECT is_doctor, tenant_id, scope FROM roles WHERE id = $1',
        [role_id]
    )
    return rows[0] || null;
}


async function getAllUsers(tenant_id) {
    const query = `
    SELECT
    u.id,
    u.email,
    u.is_active AS is_active_global,

    pr.full_name,
    pr.phone,
    pr.address,
    
    ubr.is_active AS is_active_branch,
    ubr.branch_id,
    ubr.role_id,

    br.name as branch_name,
    t.name as tenant_name,
    r.name as role_name,
    
    d.room
    FROM users u 
    JOIN user_branch_roles ubr ON u.id = ubr.user_id
    JOIN branches br ON ubr.branch_id = br.id
    JOIN tenants t ON ubr.tenant_id = t.id
    JOIN roles r ON ubr.role_id = r.id
    JOIN profiles pr ON u.id = pr.user_id
    LEFT JOIN doctors d ON d.id = u.id AND d.tenant_id = ubr.tenant_id AND d.branch_id = ubr.branch_id
    WHERE u.tenant_id = $1 AND u.is_active = true ;`

    const { rows } = await pool.query(query, [tenant_id]);
    return rows;
}
async function getUserById(user_id, tenant_id) {
    const query = `
    SELECT
    u.id,
    u.email,
    u.is_active AS is_active_global,

    pr.full_name,
    pr.phone,
    pr.address,

    br.name as branch_name,
    t.name as tenant_name,
    r.name as role_name,

    ubr.is_active AS is_active_branch,
    d.room
    FROM users u 
    JOIN user_branch_roles ubr ON u.id = ubr.user_id
    JOIN branches br ON ubr.branch_id = br.id
    JOIN tenants t ON ubr.tenant_id = t.id
    JOIN roles r ON ubr.role_id = r.id
    JOIN profiles pr ON u.id = pr.user_id
    LEFT JOIN doctors d ON d.id = u.id AND d.tenant_id = ubr.tenant_id AND d.branch_id = ubr.branch_id
    WHERE u.tenant_id = $1 AND u.id = $2 ;`

    const { rows } = await pool.query(query, [tenant_id, user_id]);
    return rows[0] || null;
}

async function updateUser(user_id, tenant_id, userData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
    UPDATE users
    SET email = COALESCE($1, email),
    password = COALESCE($2, password),
    is_active = COALESCE($3, is_active)
    WHERE id = $4 AND tenant_id = $5
    RETURNING *
    `;
        const values = [userData.email, userData.password, userData.is_active, user_id, tenant_id];
        const result = await client.query(query, values);

        // NOTE: editing a user updates identity/profile only. Branch & role
        // assignments are managed through the dedicated "Assign to Branch" flow.
        // (Updating user_branch_roles here used to touch EVERY assignment of the
        // user with no branch filter, which collapsed a multi-branch user's rows
        // onto the same (user_id, branch_id, role_id) and hit the unique
        // constraint -> "Duplicate value".)

        const query3 = `
            UPDATE profiles 
            SET full_name= COALESCE($1, full_name),
            phone= COALESCE($2, phone),
            address= COALESCE($3, address)
            WHERE user_id = $4
            RETURNING *
            `;
        const values3 = [userData.full_name, userData.phone, userData.address, user_id];
        await client.query(query3, values3);

        // Update Doctor Room if provided and user is a doctor (or if filtering by doctor role is needed, but assuming user_id link is enough)
        // We use COALESCE to keep existing room if userData.room is undefined/null
        if (userData.room !== undefined) {
            const query4 = `
            UPDATE doctors
            SET room = $1
            WHERE id = $2 AND tenant_id = $3 AND ($4::bigint IS NULL OR branch_id = $4)
            RETURNING *
            `;
            const values4 = [userData.room, user_id, tenant_id, userData.branch_id ?? null];
            await client.query(query4, values4);
        }


        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}



async function assigendToTheBranch(user_id, tenant_id, branch_id, role_id, client = pool) {
    // idempotent: re-assigning the same (user, branch, role) reactivates the row
    // instead of throwing a unique-constraint "Duplicate value" error.
    const query = `
    INSERT INTO user_branch_roles (user_id,branch_id,tenant_id,role_id)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id, branch_id, role_id)
        DO UPDATE SET is_active = true
    RETURNING *;
    `;
    const values = [user_id, branch_id, tenant_id, role_id];
    const { rows } = await client.query(query, values);
    return rows[0] || null;
}


// both must belong to this clinic
async function clinicHas(user_id, branch_id, tenant_id, client = pool) {
    const query = `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND tenant_id = $3) AS user_ok,
                          EXISTS (SELECT 1 FROM branches WHERE id = $2 AND tenant_id = $3) AS branch_ok`;
    const { rows } = await client.query(query, [user_id, branch_id, tenant_id]);
    return rows[0];
}

// the user's role rows in one branch, oldest first
async function getBranchRows(user_id, tenant_id, branch_id, client = pool) {
    const query = `SELECT ubr.id, r.scope FROM user_branch_roles ubr JOIN roles r ON r.id = ubr.role_id
                   WHERE ubr.user_id = $1 AND ubr.tenant_id = $2 AND ubr.branch_id = $3 ORDER BY ubr.id`;
    const { rows } = await client.query(query, [user_id, tenant_id, branch_id]);
    return rows;
}

async function removeBranchRows(ids, client = pool) {
    await client.query(`DELETE FROM user_branch_roles WHERE id = ANY($1::bigint[])`, [ids]);
}

async function setBranchRole(id, role_id, client = pool) {
    const query = `UPDATE user_branch_roles SET role_id = $2, is_active = true WHERE id = $1 RETURNING *`;
    const { rows } = await client.query(query, [id, role_id]);
    return rows[0] || null;
}

//-------------------------------- dropdown---------
async function getRoles(tenant_id) {
    // built-in roles + this clinic's custom roles
    const query = `SELECT id, name, is_doctor, tenant_id FROM roles WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY tenant_id NULLS FIRST, id`;
    const { rows } = await pool.query(query, [tenant_id]);
    return rows;
}
export default { createUser, checkRoleIfDoc, getAllUsers, getUserById, updateUser, getRoles, assigendToTheBranch, clinicHas, getBranchRows, removeBranchRows, setBranchRole }
