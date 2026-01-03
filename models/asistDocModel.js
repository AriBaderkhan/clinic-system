// import pool from '../db_connection.js';

// async function asist_doc(doctor_id,asist_id){
//         const query = `INSERT INTO doctor_assistants (doctor_id,assistant_id) VALUES ($1,$2) RETURNING *`;
//         const values = [doctor_id,asist_id];
//         const {rows}= await pool.query(query,values)
//         return rows[0];
//     }



// export default {asist_doc};