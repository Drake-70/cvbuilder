const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    default: '',
    trim: true
  },
  location: {
    type: String,
    default: '',
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  salary: {
    type: String,
    default: ''
  },
  jobType: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    enum: ['careerjet', 'myjobmag', 'emploi', 'camerjobs', 'jobberman', 'goafrica'],
    required: true,
    index: true
  },
  sourceUrl: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  applyUrl: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: ''
  },
  postedAt: {
    type: Date,
    default: null
  },
  scrapedAt: {
    type: Date,
    default: Date.now
  },
  isRemote: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  applyCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

jobSchema.index({ title: 'text', company: 'text', description: 'text', location: 'text' });
jobSchema.index({ active: 1, postedAt: -1 });
jobSchema.index({ active: 1, category: 1, postedAt: -1 });
jobSchema.index({ active: 1, location: 1, postedAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
