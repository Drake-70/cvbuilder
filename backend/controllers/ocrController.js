const multer = require('multer');
const { extractTextFromImage } = require('../services/ocrService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for images
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Please upload a JPEG, PNG, WebP, or GIF image.'));
    }
  }
}).single('image');

exports.uploadMiddleware = upload;

exports.extractFromImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const result = await extractTextFromImage(req.file.buffer, req.file.mimetype);

    if (!result.success) {
      return res.status(422).json({ error: result.error });
    }

    res.json({ text: result.text });
  } catch (err) {
    if (err.message && err.message.includes('upload')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};
