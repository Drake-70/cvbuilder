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
  // The one thing still to do on this application, and when.
  //
  // Deliberately not the AI's suggestion. The tracker already guesses a follow-up
  // from elapsed time, and a generated action would either be generic ("follow up
  // on your application") or invented -- and the user cannot tell which. This is a
  // field they write, because "email Mme Ngo about the interview slot" is the
  // useful answer and no model knows it.
  //
  // Free text rather than an enum: the dashboard aggregates on `followUpDate`,
  // which is the actionable axis. Classifying the action itself would only matter
  // if something could usefully filter by it, and nothing can.
  nextAction: {
    type: String,
    default: '',
    trim: true
  },
  followUpDate: {
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
// Supports "what needs my attention", which filters on a date within a window
// rather than sorting the whole list.
tailoredDocumentSchema.index({ userId: 1, followUpDate: 1 });

module.exports = mongoose.model('TailoredDocument', tailoredDocumentSchema);
