import pool from '../db_connection.js';

async function createUser(email, hashedPassword, tenant_id, is_active) {
    const query = `INSERT INTO users (email,password,tenant_id,is_active) VALUES ($1,$2,$3,$4) RETURNING id`;
    const values = [email, hashedPassword, tenant_id, is_active];
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
}

async function checkRoleIfDoc(role_id) {
    const { rows } = await pool.query(
        'SELECT name FROM roles WHERE id = $1',
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
    LEFT JOIN doctors d ON u.id = d.id
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
    LEFT JOIN doctors d ON u.id = d.id
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

        const query2 = `
        UPDATE user_branch_roles
        SET is_active = COALESCE($1, is_active),
        branch_id= COALESCE($2, branch_id),
        role_id= COALESCE($3, role_id)
        WHERE user_id = $4 AND tenant_id = $5
        RETURNING *
        `;
        const values2 = [userData.is_active, userData.branch_id, userData.role_id, user_id, tenant_id];
        const result2 = await client.query(query2, values2);

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
            WHERE id = $2 AND tenant_id = $3
            RETURNING *
            `;
            const values4 = [userData.room, user_id, tenant_id];
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



async function assigendToTheBranch(user_id, tenant_id, branch_id, role_id) {
    const query = `
    INSERT INTO user_branch_roles (user_id,branch_id,tenant_id,role_id)
    VALUES ($1,$2,$3,$4)
    RETURNING *;
    `;
    const values = [user_id, branch_id, tenant_id, role_id];
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
}


//-------------------------------- dropdown---------
async function getRoles() {
    const query = `SELECT id,name FROM roles`;
    const { rows } = await pool.query(query);
    return rows;
}
export default { createUser, checkRoleIfDoc, getAllUsers, getUserById, updateUser, getRoles, assigendToTheBranch }
