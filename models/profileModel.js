import  pool  from '../db_connection.js';


async function addProfile(user_id,full_name,phone,address){
        const query = `INSERT INTO profiles (user_id,full_name,phone,address) VALUES ($1,$2,$3,$4) RETURNING *`;
        const values = [user_id,full_name,phone,address];
        const {rows}= await pool.query(query,values);
        return rows[0];
    
}


// async function findDocIdByName(doctor_name){
//         const query = `SELECT user_id FROM profiles WHERE full_name=$1`;
//         const values = [doctor_name];
//         const {rows }= await  pool.query(query,values);
//         return rows;
// }

export default { 
        addProfile 
        //findDocIdByName
         }