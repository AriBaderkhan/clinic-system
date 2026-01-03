// import pool from '../db_connection.js';

// async function addAsist(asist_id,badge_no){
//         const query = `INSERT INTO assistants (id,badge_no) VALUES ($1,$2) RETURNING *`;
//         const values = [asist_id,badge_no];
//         const{ rows } =  await pool.query(query,values)
//         return rows[0];
//     }

// export default { addAsist }