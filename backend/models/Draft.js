const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  step: {
    type: String,
    default: 'choose'
  },
  sourcePath: {
    type: String,
    default: 'upload'
  },
  cvText: {
    type: String,
    default: ''
  },
  savedCvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CV',
    default: null
  },
  savedDocId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TailoredDocument',
    default: null
  },
  jobDescription: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    enum: ['en', 'fr'],
    default: 'en'
  }
}, { timestamps: true });

module.exports = mongoose.model('Draft', draftSchema);
