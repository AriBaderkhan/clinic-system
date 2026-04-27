import pool from '../db_connection.js';

// 1. Feature CRUD
async function createFeature(name, code, description) {
    const { rows } = await pool.query(
        'INSERT INTO features (name, code, description) VALUES ($1, $2, $3) RETURNING *',
        [name, code, description]
    );
    return rows[0];
}

async function getFeatures() {
    const { rows } = await pool.query('SELECT * FROM features');
    return rows;
}

// 2. Plan Assignment
async function assignFeatureToPlan(planId, featureId) {
    const { rows } = await pool.query(
        'INSERT INTO plan_features (plan_id, feature_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [planId, featureId]
    );
    return rows[0];
}

async function removeFeatureFromPlan(planId, featureId) {
    const { rows } = await pool.query(
        'DELETE FROM plan_features WHERE plan_id = $1 AND feature_id = $2 RETURNING *',
        [planId, featureId]
    );
    return rows[0];
}

async function getPlanFeatures(planId) {
    const { rows } = await pool.query(`
        SELECT f.* 
        FROM features f
        JOIN plan_features pf ON f.id = pf.feature_id
        WHERE pf.plan_id = $1
    `, [planId]);
    return rows;
}

export default {
    createFeature,
    getFeatures,
    assignFeatureToPlan,
    removeFeatureFromPlan,
    getPlanFeatures
};
