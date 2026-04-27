import pool from "../db_connection.js";

async function findPermissionsByRole(role_id) {
    const query = `
    SELECT 
    p.key AS permission_key
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = $1`;
    const values = [role_id];
    const { rows } = await pool.query(query, values);
    return rows;
}



export default { findPermissionsByRole }