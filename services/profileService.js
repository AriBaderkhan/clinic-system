import crypto from 'crypto';
import bcrypt from 'bcrypt';
import appError from '../utils/appError.js';
import storage from '../config/storage.js';
import profileModel from '../models/profileModel.js';
import authModel from '../models/authModel.js';
import verificationService from './verificationService.js';

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EMAIL_PURPOSE = 'change_email';

// The caller's own profile (role is shown but never editable here).
async function getMe(user) {
    const p = await profileModel.getByUserId(user.id);
    const image_url = p?.image_path ? await storage.getSignedUrl(p.image_path) : null;
    return {
        user_id: user.id,
        email: p?.email ?? null,
        full_name: p?.full_name ?? user.name ?? '',
        phone: p?.phone ?? '',
        address: p?.address ?? '',
        role: user.role,
        image_url,
    };
}

async function updateMe(user, data, file) {
    const { full_name, phone, address } = data;
    await profileModel.updateProfile(user.id, { full_name, phone, address });

    if (file) {
        const current = await profileModel.getByUserId(user.id);
        const ext = EXT_BY_MIME[file.mimetype] || 'bin';
        const objectPath = `avatars/user_${user.id}/${crypto.randomUUID()}.${ext}`;
        await storage.uploadBuffer({ buffer: file.buffer, objectPath, contentType: file.mimetype });
        await profileModel.setImage(user.id, objectPath);
        if (current?.image_path) await storage.removeObject(current.image_path).catch(() => {}); // drop the old one
    }
    return getMe(user);
}

async function changePassword(user, currentPassword, newPassword) {
    const cred = await authModel.getCredById(user.id);
    if (!cred) throw appError('USER_NOT_FOUND', 'User not found', 404);
    const ok = await bcrypt.compare(currentPassword, cred.password);
    if (!ok) throw appError('WRONG_PASSWORD', 'Current password is incorrect', 400);
    const hash = await bcrypt.hash(newPassword, 10);
    await authModel.updatePassword(user.id, hash);
    return { changed: true };
}

// Email change verifies the NEW address (reuses the generic OTP engine).
async function sendEmailChangeCode(user, newEmail) {
    if (await authModel.emailExists(newEmail)) throw appError('EMAIL_TAKEN', 'This email is already in use', 409);
    return verificationService.requestCode(newEmail, EMAIL_PURPOSE);
}

async function changeEmail(user, newEmail, code) {
    await verificationService.confirmCode(newEmail, code, EMAIL_PURPOSE);
    const row = await verificationService.assertVerified(newEmail, EMAIL_PURPOSE);
    if (await authModel.emailExists(newEmail)) throw appError('EMAIL_TAKEN', 'This email is already in use', 409);
    await authModel.updateEmail(user.id, newEmail);
    await verificationService.consume(row.id);
    return { changed: true, email: newEmail };
}

export default { getMe, updateMe, changePassword, sendEmailChangeCode, changeEmail };
