import  pool  from '../db_connection.js';


async function addProfile(user_id,full_name,phone,address){
        const query = `INSERT INTO profiles (user_id,full_name,phone,address) VALUES ($1,$2,$3,$4) RETURNING *`;
        const values = [user_id,full_name,phone,address];
        const {rows}= await pool.query(query,values);
        return rows[0];

}

// The user's own profile + email (LEFT JOIN so it works even if a profile row
// is somehow missing).
async function getByUserId(user_id) {
        const query = `SELECT u.id AS user_id, u.email,
                              p.full_name, p.phone, p.address, p.image_path
                       FROM users u
                       LEFT JOIN profiles p ON p.user_id = u.id
                       WHERE u.id = $1`;
        const { rows } = await pool.query(query, [user_id]);
        return rows[0] || null;
}

// Update profile fields; insert the row if it didn't exist yet.
async function updateProfile(user_id, { full_name, phone, address }) {
        const upd = await pool.query(
                `UPDATE profiles SET full_name = $2, phone = $3, address = $4 WHERE user_id = $1 RETURNING *`,
                [user_id, full_name, phone ?? null, address ?? null]
        );
        if (upd.rows[0]) return upd.rows[0];
        const ins = await pool.query(
                `INSERT INTO profiles (user_id, full_name, phone, address) VALUES ($1, $2, $3, $4) RETURNING *`,
                [user_id, full_name, phone ?? null, address ?? null]
        );
        return ins.rows[0];
}

async function setImage(user_id, image_path) {
        const { rows } = await pool.query(
                `UPDATE profiles SET image_path = $2 WHERE user_id = $1 RETURNING *`,
                [user_id, image_path]
        );
        return rows[0] || null;
}


// async function findDocIdByName(doctor_name){
//         const query = `SELECT user_id FROM profiles WHERE full_name=$1`;
//         const values = [doctor_name];
//         const {rows }= await  pool.query(query,values);
//         return rows;
// }

export default {
        addProfile,
        getByUserId,
        updateProfile,
        setImage,
        //findDocIdByName
         }