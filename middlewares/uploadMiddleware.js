import multer from 'multer';
import appError from '../utils/appError.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per image
// Effectively "as many as they want" for real clinical use — kept high (not
// unlimited) only so a single request can't exhaust server memory.
const MAX_FILES = 50;

// The first bytes every real file of that type starts with. The type the sender writes
// on the file can be anything, so the CONTENT is checked too.
const looksLike = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

// One upload middleware per "how many images this page needs".
function makeUpload(maxFiles) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (ALLOWED.has(file.mimetype)) return cb(null, true);
      cb(appError('INVALID_FILE_TYPE', 'Only JPG, PNG or WEBP images are allowed', 400));
    },
  });

  // Wrap multer so its errors become our standard appError (status + message)
  // instead of falling through to the generic 500 handler.
  return (req, res, next) => {
    upload.array('images', maxFiles)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 10MB or smaller'
          : (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') ? `Too many images (max ${maxFiles})`
          : 'Upload error';
        return next(appError('UPLOAD_ERROR', msg, 400));
      }
      if (err) return next(err); // our appError (has status) or anything else
      const fake = (req.files || []).find((f) => !looksLike[f.mimetype]?.(f.buffer));
      if (fake) return next(appError('INVALID_FILE_TYPE', 'Only JPG, PNG or WEBP images are allowed', 400));
      next();
    });
  };
}

// visit photos: many at once
const uploadImages = makeUpload(MAX_FILES);
// pages that need exactly one picture (public sign-up, profile photo): never 50 × 10 MB in memory
const uploadOneImage = makeUpload(1);

export { uploadImages, uploadOneImage };
export default uploadImages;
