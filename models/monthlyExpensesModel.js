import pool from '../db_connection.js'

async function createMonthlyExpneses(monthlyExpensesDetail, tenant_id, branch_id) {
    const { type, amount, expense_date, note, created_by } = monthlyExpensesDetail

    const query = `
    INSERT INTO monthly_expenses (type, amount, expense_date, note, created_by, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
    `;
    const values = [type, amount, expense_date, note, created_by, tenant_id, branch_id]
    const created = await pool.query(query, values);
    return created.rows[0] || null;
}

async function getAllMonthlyExpneses(tenant_id, branch_id, type, month) {
    const baseQuery = `SELECT * FROM monthly_expenses WHERE tenant_id = $1 AND branch_id = $2 `;

    const where = [];
    const values = [tenant_id, branch_id];
    let idx = 3;

    if (type) {
        where.push(`type = $${idx}`);
        values.push(type);
        idx++;
    }
    if (month) {
        where.push(`TO_CHAR(expense_date, 'Mon YYYY') = $${idx}`);
        values.push(month);
        idx++;
    }

    let query = baseQuery;
    if (where.length > 0) {
        query += ` AND ` + where.join(" AND ");
    }

    query += ` ORDER BY expense_date DESC`;
    const result = await pool.query(query, values);
    return result.rows
}

async function getMonthlyExpneses(expensesId, tenant_id, branch_id) {
    const query = `SELECT * FROM monthly_expenses WHERE id = $1 AND tenant_id = $2 AND branch_id = $3;`
    const value = [expensesId, tenant_id, branch_id]
    const feteched = await pool.query(query, value)
    return feteched.rows[0] || null;
}

async function updateMonthlyExpneses(expensesId, fields, updated_by, tenant_id, branch_id) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    if (keys.length === 0) throw new Error("No fields provided");

    keys.push("updated_by");
    values.push(updated_by);

    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

    const query = `UPDATE monthly_expenses SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3} RETURNING *;`;
    const allValues = [...values, expensesId, tenant_id, branch_id];
    const updated = await pool.query(query, allValues);
    return updated.rows[0] || null;
}

async function deleteMonthlyExpneses(expensesId, tenant_id, branch_id) {
    const query = `DELETE FROM monthly_expenses WHERE id=$1 AND tenant_id = $2 AND branch_id = $3 RETURNING *;`;
    const value = [expensesId, tenant_id, branch_id];
    const deleted = await pool.query(query, value);
    return deleted.rows[0] || null;
}

async function getAvailableMonths(tenant_id, branch_id) {
    const query = `
        SELECT DISTINCT TO_CHAR(expense_date, 'Mon YYYY') as month,
        DATE_TRUNC('month', expense_date) as sort_date
        FROM monthly_expenses
        WHERE tenant_id = $1 AND branch_id = $2
        ORDER BY sort_date DESC
    `;
    const result = await pool.query(query, [tenant_id, branch_id]);
    return result.rows.map(row => row.month);
}

async function getAvailableTypes(tenant_id, branch_id) {
    const query = `
        SELECT DISTINCT type FROM monthly_expenses
        WHERE tenant_id = $1 AND branch_id = $2`;
    const result = await pool.query(query, [tenant_id, branch_id]);
    return result.rows
}

export default { createMonthlyExpneses, getAllMonthlyExpneses, getMonthlyExpneses, updateMonthlyExpneses, deleteMonthlyExpneses, getAvailableMonths, getAvailableTypes }