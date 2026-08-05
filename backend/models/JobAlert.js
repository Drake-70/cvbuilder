const mongoose = require('mongoose');

const jobAlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    default: '',
    trim: true
  },
  keywords: {
    type: [String],
    required: true,
    validate: [(v) => Array.isArray(v) && v.length > 0, 'At least one keyword is required']
  },
  locations: {
    type: [String],
    default: []
  },
  categories: {
    type: [String],
    default: []
  },
  emailEnabled: {
    type: Boolean,
    default: true
  },
  active: {
    type: Boolean,
    default: true
  },
  lastMatchedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('JobAlert', jobAlertSchema);
