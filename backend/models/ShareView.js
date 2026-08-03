const mongoose = require('mongoose');

const shareViewSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, index: true },
    ipHash: { type: String, required: true },
    userAgent: { type: String, default: '' },
    referer: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

shareViewSchema.index({ token: 1, createdAt: -1 });

module.exports = mongoose.model('ShareView', shareViewSchema);
