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

// 3. Per-clinic extras
async function getTenantGrants(tenantId) {
    const { rows } = await pool.query(`
        SELECT g.feature_id, f.code, f.name, g.expires_at, g.note, g.created_at,
               (g.expires_at IS NULL OR g.expires_at > NOW()) AS active
          FROM tenant_feature_grants g
          JOIN features f ON f.id = g.feature_id
         WHERE g.tenant_id = $1
         ORDER BY f.name`, [tenantId]);
    return rows;
}

// one extra per clinic + feature: giving it again updates the end date / note
async function upsertTenantGrant(tenantId, featureId, expiresAt, note, grantedBy) {
    const { rows } = await pool.query(`
        INSERT INTO tenant_feature_grants (tenant_id, feature_id, expires_at, note, granted_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, feature_id)
        DO UPDATE SET expires_at = EXCLUDED.expires_at, note = EXCLUDED.note, granted_by = EXCLUDED.granted_by, created_at = NOW()
        RETURNING *`, [tenantId, featureId, expiresAt, note, grantedBy]);
    return rows[0];
}

async function removeTenantGrant(tenantId, featureId) {
    const { rows } = await pool.query('DELETE FROM tenant_feature_grants WHERE tenant_id = $1 AND feature_id = $2 RETURNING *', [tenantId, featureId]);
    return rows[0];
}

async function tenantExists(tenantId) {
    const { rows } = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
    return rows.length > 0;
}

async function featureExists(featureId) {
    const { rows } = await pool.query('SELECT 1 FROM features WHERE id = $1', [featureId]);
    return rows.length > 0;
}

export default {
    getTenantGrants, upsertTenantGrant, removeTenantGrant, tenantExists, featureExists,
    createFeature,
    getFeatures,
    assignFeatureToPlan,
    removeFeatureFromPlan,
    getPlanFeatures
};
