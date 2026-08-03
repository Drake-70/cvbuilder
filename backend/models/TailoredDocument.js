const mongoose = require('mongoose');

const tailoredDocumentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  baseCvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CV',
    default: null
  },
  jobTitle: {
    type: String,
    default: '',
    trim: true
  },
  jobDescription: {
    type: String,
    default: ''
  },
  tailoredContent: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  coverLetter: {
    type: String,
    default: ''
  },
  gapAnalysis: [{
    type: String
  }],
  language: {
    type: String,
    enum: ['en', 'fr'],
    default: 'en'
  },
  paid: {
    type: Boolean,
    default: false
  },
  applicationStatus: {
    type: String,
    enum: ['draft', 'applied', 'interviewed', 'offered', 'rejected', 'withdrawn'],
    default: 'draft'
  },
  companyApplied: {
    type: String,
    default: '',
    trim: true
  },
  appliedAt: {
    type: Date,
    default: null
  },
  template: {
    type: String,
    enum: ['modern', 'classic', 'creative', 'professional', 'minimal', 'bold'],
    default: 'modern'
  },
  shareToken: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

tailoredDocumentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('TailoredDocument', tailoredDocumentSchema);
