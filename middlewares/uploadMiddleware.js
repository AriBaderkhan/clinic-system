import multer from 'multer';
import appError from '../utils/appError.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_FILES = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(appError('INVALID_FILE_TYPE', 'Only JPG, PNG or WEBP images are allowed', 400));
  },
});

// Wrap multer so its errors become our standard appError (status + message)
// instead of falling through to the generic 500 handler.
function uploadImages(req, res, next) {
  upload.array('images', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 10MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT' ? `Too many images (max ${MAX_FILES})`
        : 'Upload error';
      return next(appError('UPLOAD_ERROR', msg, 400));
    }
    return next(err); // our appError (has status) or anything else
  });
}

export { uploadImages };
export default uploadImages;
