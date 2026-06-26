import crypto from 'crypto';
import appError from '../utils/appError.js';
import storage from '../config/storage.js';
import announcementModel from '../models/announcementModel.js';
import subscriptionModel from '../models/subscriptionModel.js';

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Admin: create an announcement (optional image).
async function create(admin, data, file) {
    const { title, body, target_plan_id, target_roles } = data;

    let image_path = null;
    if (file) {
        const ext = EXT_BY_MIME[file.mimetype] || 'bin';
        const objectPath = `announcements/${crypto.randomUUID()}.${ext}`;
        await storage.uploadBuffer({ buffer: file.buffer, objectPath, contentType: file.mimetype });
        image_path = objectPath;
    }

    // Normalise roles: a multipart field can arrive as a single string or array;
    // none selected = NULL = all roles.
    const roles = target_roles ? [].concat(target_roles).filter(Boolean) : [];

    return announcementModel.create({
        title,
        body,
        image_path,
        video_url: null,                          // reserved for later
        target_plan_id: target_plan_id || null,   // empty = all plans
        target_roles: roles.length ? roles : null, // empty = all roles
        created_by: admin.id,
    });
}

// Admin: list (optional plan filter), with signed image URLs.
async function listAdmin(planId) {
    const rows = await announcementModel.listAdmin(planId);
    return Promise.all(rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await storage.getSignedUrl(r.image_path) : null,
    })));
}

// Any tenant user: announcements matching their plan (or all) AND role (or all).
async function listForMe(user) {
    if (!user.tenant_id) return []; // platform admin has no tenant / no bell
    const sub = await subscriptionModel.getByTenant(user.tenant_id);
    const planId = sub?.plan_id ?? null;
    const rows = await announcementModel.listForUser(user.id, planId, user.role);
    return Promise.all(rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await storage.getSignedUrl(r.image_path) : null,
    })));
}

async function markRead(id, user) {
    await announcementModel.markRead(id, user.id);
    return { read: true };
}

async function remove(id) {
    const a = await announcementModel.getById(id);
    if (!a) throw appError('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found', 404);
    await announcementModel.remove(id);
    return { removed: true };
}

export default { create, listAdmin, listForMe, markRead, remove };
