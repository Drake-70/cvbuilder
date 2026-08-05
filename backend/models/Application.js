const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  method: {
    type: String,
    enum: ['tailor', 'email', 'link'],
    required: true
  },
  cvId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CV',
    default: null
  },
  tailoredDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TailoredDocument',
    default: null
  },
  coverLetter: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['applied', 'interviewed', 'offered', 'rejected', 'withdrawn'],
    default: 'applied'
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

applicationSchema.index({ userId: 1, createdAt: -1 });
applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);
