const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Not a schema enum on purpose. The allow-list lives in `draftController`
  // (`DRAFT_STEPS`) so that a write with an unknown step is a 400 naming the
  // problem, rather than a ValidationError thrown from deep inside a save. A
  // legacy row holding a step this build no longer recognises also self-heals:
  // the read path reports it as unusable and the next write replaces it.
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
  originalCV: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // The build questionnaire's in-progress answers.
  //
  // This field existing at all is the fix for drafts that could not be opened.
  // `BuildStep` held its entire state — sub-step, personal details, education,
  // experience, activities, skills, certifications — in local `useState`, none of
  // it passed up to the page, so none of it reached the autosave. A build-path
  // draft therefore persisted `{ step: 'build' }` and nothing else, and restoring
  // it dropped the user into a blank questionnaire. Every draft in the production
  // database at the time was exactly that: a step name and no content.
  buildState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
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