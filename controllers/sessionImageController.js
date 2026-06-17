import sessionImageService from '../services/sessionImageService.js';
import asyncWrap from '../utils/asyncWrap.js';

const upload = asyncWrap(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { tenant_id, branch_id, id } = req.user;

  const result = await sessionImageService.addImages(sessionId, req.files, id, tenant_id, branch_id);
  res.status(201).json({ ok: true, data: result });
});

const list = asyncWrap(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const { tenant_id, branch_id } = req.user;

  const result = await sessionImageService.getImages(sessionId, tenant_id, branch_id);
  res.status(200).json({ ok: true, data: result });
});

const remove = asyncWrap(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const imageId = Number(req.params.imageId);
  const { tenant_id, branch_id } = req.user;

  await sessionImageService.deleteImage(sessionId, imageId, tenant_id, branch_id);
  res.status(200).json({ ok: true });
});

export default { upload, list, remove };
