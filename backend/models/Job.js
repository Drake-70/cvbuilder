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
    enum: ['careerjet', 'myjobmag', 'emploi', 'camerjobs', 'jobberman', 'goafrica', 'louma'],
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
  // Set when the listing ages out of the board (see expireStaleJobs). Kept
  // distinct from `active` so the reason a job is hidden stays auditable, and
  // cleared again if a later scrape sees the job still listed by its source.
  expiredAt: {
    type: Date,
    default: null
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
// Supports the expiry sweep, which scans active jobs by last-seen date.
jobSchema.index({ active: 1, scrapedAt: 1 });

module.exports = mongoose.model('Job', jobSchema);
