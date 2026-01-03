import pool from '../db_connection.js'

async function createMonthlyExpneses(monthlyExpensesDetail){
    const {month,materials,salary,company_name,company_total,electric,rent,tax,marketing,other,notes,created_by}= monthlyExpensesDetail

    const query =`
    INSERT INTO monthly_expenses (month,materials,salary,company_name,company_total,electric,rent,tax,marketing,other,notes,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *;
    `;
    const values = [month,materials,salary,company_name,company_total,electric,rent,tax,marketing,other,notes,created_by]
    const created =  await pool.query(query,values);
    return created.rows[0] || null;
}

async function getAllMonthlyExpneses(){
     const query = `SELECT * FROM monthly_expenses;`
     const feteched = await pool.query(query)
     return feteched.rows;
}

async function getMonthlyExpneses(expensesId){
     const query = `SELECT * FROM monthly_expenses WHERE id = $1;`
     const value = [expensesId]
     const feteched = await pool.query(query,value)
     return feteched.rows[0] || null;
}

async function updateMonthlyExpneses(expensesId, fields, updated_by) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    if (keys.length === 0) throw new Error("No fields provided");

    keys.push("updated_by");
    values.push(updated_by);

    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

    const query = `UPDATE monthly_expenses SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *;`;
    const allValues = [...values, expensesId];
    const updated = await pool.query(query, allValues);
    return updated.rows[0] || null;
}

async function deleteMonthlyExpneses(expensesId) {
    const query = `DELETE FROM monthly_expenses WHERE id=$1 RETURNING *;`;
    const value = [expensesId];
    const deleted = await pool.query(query, value);
    return deleted.rows[0] || null;
}

export default {createMonthlyExpneses, getAllMonthlyExpneses, getMonthlyExpneses, updateMonthlyExpneses, deleteMonthlyExpneses}