
import pool from '../db_connection.js';

async function registerUser(email, hashedPassword, role) {
        const query = `INSERT INTO users (email,password,role) VALUES ($1,$2,$3) RETURNING id`;
        const values = [email, hashedPassword, role];
        const { rows }= await pool.query(query, values);
        return rows[0] || null;
   
}

async function loginUser(email) {
        const query = `SELECT u.id, u.email, u.password, u.role, p.full_name
                FROM users u
                JOIN profiles p ON u.id = p.user_id
                WHERE LOWER(u.email) = LOWER($1)`;
        const value = [email];
        const { rows } = await pool.query(query, value);
        return rows[0] || null;
   
}


export default { registerUser, loginUser }