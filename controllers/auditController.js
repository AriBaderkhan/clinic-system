import auditService from '../services/auditService.js';
import asyncWrap from '../utils/asyncWrap.js';

// Tenant manager: read the tenant's activity log (search by name + date range).
const list = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const { q, from, to, page } = req.query;
    const result = await auditService.list(tenant_id, { q, from, to, page });
    res.status(200).json({ ok: true, data: result });
});

export default { list };
