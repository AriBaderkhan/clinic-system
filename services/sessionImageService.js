import crypto from 'crypto';
import appError from '../utils/appError.js';
import storage from '../config/storage.js';
import sessionModel from '../models/sessionModel.js';
import sessionImageModel from '../models/sessionImageModel.js';

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// every image action first proves the session belongs to this tenant+branch
async function ensureSession(sessionId, tenant_id, branch_id) {
  const session = await sessionModel.getSession(sessionId, tenant_id, branch_id);
  if (!session) throw appError('SESSION_NOT_FOUND', 'Session not found', 404);
  return session;
}

// turn stored rows into the lean shape the frontend needs, with a fresh signed URL
async function withUrls(rows) {
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      session_id: r.session_id,
      mime_type: r.mime_type,
      uploaded_by: r.uploaded_by,
      created_at: r.created_at,
      url: await storage.getSignedUrl(r.storage_path),
    }))
  );
}

async function addImages(sessionId, files, userId, tenant_id, branch_id) {
  if (!files || files.length === 0) throw appError('NO_FILES', 'No images provided', 400);
  await ensureSession(sessionId, tenant_id, branch_id);

  // 1) push every file to storage first; remember paths for cleanup
  const uploaded = [];
  try {
    for (const f of files) {
      const ext = EXT_BY_MIME[f.mimetype] || 'bin';
      const objectPath = `tenant_${tenant_id}/branch_${branch_id}/session_${sessionId}/${crypto.randomUUID()}.${ext}`;
      await storage.uploadBuffer({ buffer: f.buffer, objectPath, contentType: f.mimetype });
      uploaded.push({
        session_id: sessionId,
        storage_path: objectPath,
        mime_type: f.mimetype,
        uploaded_by: userId || null,
      });
    }
  } catch (err) {
    await Promise.all(uploaded.map((u) => storage.removeObject(u.storage_path).catch(() => {})));
    throw appError('IMAGE_UPLOAD_FAILED', 'Failed to upload images to storage', 502);
  }

  // 2) record metadata; if the DB write fails, remove the orphaned files
  let inserted;
  try {
    inserted = await sessionImageModel.insertMany(uploaded, tenant_id, branch_id);
  } catch (err) {
    await Promise.all(uploaded.map((u) => storage.removeObject(u.storage_path).catch(() => {})));
    throw err;
  }

  return withUrls(inserted);
}

async function getImages(sessionId, tenant_id, branch_id) {
  await ensureSession(sessionId, tenant_id, branch_id);
  const rows = await sessionImageModel.getBySessionId(sessionId, tenant_id, branch_id);
  return withUrls(rows);
}

async function deleteImage(sessionId, imageId, tenant_id, branch_id) {
  await ensureSession(sessionId, tenant_id, branch_id);
  const img = await sessionImageModel.getById(imageId, tenant_id, branch_id);
  if (!img || Number(img.session_id) !== Number(sessionId)) {
    throw appError('IMAGE_NOT_FOUND', 'Image not found', 404);
  }
  await sessionImageModel.deleteById(imageId, tenant_id, branch_id);
  await storage.removeObject(img.storage_path).catch(() => {}); // row gone is what matters
  return { id: imageId };
}

// used by historyService to enrich session details. Never throws — images are a
// nice-to-have on that screen and must not break the whole details payload.
async function listForDetails(sessionId, tenant_id, branch_id) {
  try {
    const rows = await sessionImageModel.getBySessionId(sessionId, tenant_id, branch_id);
    return await withUrls(rows);
  } catch {
    return [];
  }
}

export default { addImages, getImages, deleteImage, listForDetails };
