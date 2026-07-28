const mongoose = require('mongoose');

const cvSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  label: {
    type: String,
    default: 'My CV',
    trim: true
  },
  originalText: {
    type: String,
    required: true
  },
  parsedSections: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  source: {
    type: String,
    enum: ['upload', 'paste', 'build'],
    default: 'upload'
  }
}, { timestamps: true });

module.exports = mongoose.model('CV', cvSchema);
