const { z } = require('zod');
const Job = require('../models/Job');
const TailoredDocument = require('../models/TailoredDocument');
const { computeResumeScore } = require('../services/resumeScoreService');
const { computeJobMatchScore } = require('../services/scoreService');
const { tailorCV } = require('../services/aiService');
const { JOB_CATEGORIES } = require('../config/jobCategories');

// A tailored CV pasted into a chat window is easy to exceed by accident, and the
// AI call is metered by tokens. 20k characters is roughly 12 pages of CV, far more
// than a CV should be, so hitting it means the caller is sending the wrong thing.
const CV_TEXT_MAX = 20000;
const JOB_TEXT_MAX = 20000;

const DOCUMENT_ID = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a 24-character document id');

/**
 * Resolve the CV to work on from either inline text or a saved document.
 *
 * Two inputs rather than one because the two are different mistakes: pasting text
 * is what someone does while asking a question, and naming a document is what they
 * do when the thing they care about is the one they already tailored. Requiring
 * inline text would make the saved documents unreachable from a client, and
 * requiring a document id would make the tool useless for a CV the user has not
 * uploaded yet.
 */
async function resolveCvSource(user, { cvText, documentId }) {
  const hasText = typeof cvText === 'string' && cvText.trim().length > 0;

  if (hasText && documentId) {
    throw toolError('Give either cvText or documentId, not both. They are two ways of naming the same CV.');
  }

  if (hasText) {
    if (cvText.length > CV_TEXT_MAX) {
      throw toolError(`cvText is ${cvText.length} characters; the limit is ${CV_TEXT_MAX}.`);
    }
    return { text: cvText.trim(), document: null };
  }

  if (!documentId) {
    throw toolError('Provide cvText to paste a CV, or documentId to use one of your saved documents.');
  }

  // Scoped by userId: a document id is not a secret, and finding someone else's
  // should be a miss rather than a 403 that confirms it exists.
  const doc = await TailoredDocument.findOne({ _id: documentId, userId: user._id }).lean();
  if (!doc) throw toolError('No such document. Use list_documents to see yours.');

  return { text: cvTextFromDocument(doc), document: doc };
}

/**
 * Flatten a stored document back into text.
 *
 * The document holds a structured CV, and the scoring services want text, so this
 * is the one place that shape conversion happens. Missing sections are skipped
 * rather than emitted empty, because a trailing empty heading changes what the
 * keyword scanner sees.
 */
function cvTextFromDocument(doc) {
  const cv = doc.tailoredContent || {};
  const lines = [];

  const section = (heading, body) => {
    if (!body) return;
    lines.push(heading, body, '');
  };

  if (cv.summary) lines.push(cv.summary, '');
  if (cv.experience) {
    lines.push('Experience');
    for (const exp of cv.experience) {
      if (!exp) continue;
      lines.push([exp.title, exp.company].filter(Boolean).join(' - '), exp.dates || '');
      for (const bullet of exp.bullets || []) if (bullet) lines.push(bullet);
      lines.push('');
    }
  }
  if (cv.education) {
    lines.push('Education');
    for (const ed of cv.education) {
      if (!ed) continue;
      lines.push([ed.degree, ed.institution].filter(Boolean).join(' - '), ed.dates || '');
    }
    lines.push('');
  }
  section('Skills', (cv.skills || []).filter(Boolean).join(', '));
  if (cv.certifications) {
    lines.push('Certifications');
    for (const cert of cv.certifications) {
      if (cert) lines.push([cert.title, cert.issuer, cert.year].filter(Boolean).join(' - '));
    }
  }

  return lines.join('\n').trim();
}

function toolError(message) {
  // Thrown rather than returned: the MCP layer turns an exception into an isError
  // result with this text, so the model sees what went wrong and can correct itself,
  // instead of receiving a 200 with an empty payload.
  return new Error(message);
}

function asJson(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * The tool surface.
 *
 * Read-and-analyse by default. tailor_cv is the one expensive tool, and it returns
 * a proposal rather than writing anything: the web app's contract is that a tailored
 * document is not saved until the user approves it, and an MCP client is a user
 * with a different keyboard. set_application_status is the only tool that writes,
 * it is named as a verb, and it touches only the application tracker fields --
 * never the CV itself.
 */
const TOOLS = [
  {
    name: 'score_resume',
    config: {
      title: 'Score a CV on its own',
      description:
        'Score a CV against six quality categories without any job description. Use this for "how good is my CV", never for "does this CV fit this job" -- that is match_job. The score is about the document, not about any posting.',
      inputSchema: {
        cvText: z.string().optional().describe('The CV as plain text. Omit if using documentId.'),
        documentId: DOCUMENT_ID.optional().describe('A saved document to score. Omit if using cvText.')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const { text } = await resolveCvSource(user, args);
      const result = computeResumeScore(text);

      // The service reports a score and six categories, each with its own max. The
      // total max is derived rather than hardcoded so a change to the category
      // weights cannot leave a stale number here that disagrees with the categories
      // directly beneath it.
      const max = result.categories.reduce((sum, c) => sum + (c.max || 0), 0);

      return asJson({
        score: result.score,
        max,
        // A percentage as well as the raw pair, because a client asked "how good is
        // this CV" wants a number it can show a person, and every category carries
        // its own max so the two can never drift apart.
        percent: max > 0 ? Math.round((result.score / max) * 100) : null,
        categories: result.categories
      });
    }
  },
  {
    name: 'match_job',
    config: {
      title: 'Score a CV against a job description',
      description:
        'Score how well a CV matches a job description, and return the keywords it already has and the ones it is missing. Give the posting as jobText, or jobId to use a saved listing from the job board. When there is too little signal to score, score is null and insufficient is true -- that means "not enough to judge", not a score of zero.',
      inputSchema: {
        cvText: z.string().optional().describe('The CV as plain text. Omit if using documentId.'),
        documentId: DOCUMENT_ID.optional().describe('A saved document to score.'),
        jobText: z.string().optional().describe('The job description as plain text.'),
        jobId: z.string().optional().describe('A job board listing id.')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const jobText = await resolveJobText(args);
      const { text } = await resolveCvSource(user, args);
      return asJson(computeJobMatchScore(text, jobText));
    }
  },
  {
    name: 'tailor_cv',
    config: {
      title: 'Propose a tailored rewrite',
      description:
        'Produce a tailored rewrite of a CV for a job description, and return it as a proposal. Nothing is saved: this returns the changes for review, exactly as the review screen does in the app. The caller has to decide what to keep.',
      inputSchema: {
        cvText: z.string().optional().describe('The CV as plain text. Omit if using documentId.'),
        documentId: DOCUMENT_ID.optional().describe('A saved document to tailor.'),
        jobText: z.string().optional().describe('The job description as plain text.'),
        jobId: z.string().optional().describe('A job board listing id.'),
        language: z.enum(['en', 'fr']).optional().describe('Output language. Defaults to en.')
      },
      // Read-only, and honestly so. It reads and computes and writes nothing: the
      // paid artefact in this app is the generated document, not the rewrite, and
      // generation is not exposed over MCP at all. It does spend an AI call, which
      // is bounded by the same per-minute limiter the web endpoint uses -- and
      // overstating safety to win a cheaper client prompt is not a trade worth
      // making, since the hint is what a client uses to decide whether to ask.
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const jobText = await resolveJobText(args);
      const { text, document } = await resolveCvSource(user, args);
      const language = args.language || 'en';

      const result = await tailorCV(text, jobText, language);

      return asJson({
        saved: false,
        // Restated in the payload because the most likely misuse of this tool is a
        // caller that assumes a tailored result was persisted.
        note: 'Nothing was saved. These are proposals for review, not a stored document.',
        documentId: document ? document._id.toString() : null,
        // The prompt asks the model for exactly these three keys, so these three are
        // the whole result. No `raw` alongside them: the rewrite is by far the
        // largest thing in the payload, and echoing it twice doubles the token cost
        // of the one tool here that a caller pays for.
        tailoredCV: result.tailoredCV || result.cv || null,
        coverLetter: result.coverLetter || null,
        gapAnalysis: result.gapAnalysis || result.gaps || []
      });
    }
  },
  {
    name: 'list_jobs',
    config: {
      title: 'Search the job board',
      description:
        'List active job listings, newest first. Filter by keyword, category or location. Expired listings are never returned.',
      inputSchema: {
        q: z.string().optional().describe('Keyword search across the listing text.'),
        category: z.enum(JOB_CATEGORIES).optional().describe('Filter by category.'),
        location: z.string().optional().describe('Filter by location, case-insensitive.'),
        limit: z.number().int().min(1).max(50).optional().describe('How many to return. Default 20.')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const limit = args.limit || 20;
      const filter = { active: true };
      if (args.q) filter.$text = { $search: args.q };
      if (args.category) filter.category = args.category;
      if (args.location) {
        // Escaped: this is user input going into a RegExp, and an unescaped
        // "(dakar)" is a pattern rather than a literal.
        filter.location = { $regex: args.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      }

      const jobs = await Job.find(filter)
        .sort({ postedAt: -1, _id: -1 })
        .limit(limit)
        .lean();

      return asJson({
        count: jobs.length,
        categories: JOB_CATEGORIES,
        // description trimmed because a listing body can be tens of kilobytes and
        // would crowd out the actual results.
        jobs: jobs.map(j => ({
          id: j._id.toString(),
          title: j.title,
          company: j.company,
          location: j.location,
          category: j.category,
          jobType: j.jobType,
          salary: j.salary,
          isRemote: j.isRemote,
          postedAt: j.postedAt,
          applyUrl: j.applyUrl,
          source: j.source,
          description: j.description ? String(j.description).slice(0, 2000) : ''
        }))
      });
    }
  },
  {
    name: 'get_job',
    config: {
      title: 'Read one job listing',
      description: 'Fetch a single listing in full, including the whole job description.',
      inputSchema: { jobId: z.string().describe('The listing id from list_jobs.') },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const job = await Job.findOne({ _id: args.jobId, active: true }).lean();
      if (!job) throw toolError('No such listing. It may have expired; use list_jobs for current ones.');
      return asJson({ ...job, id: job._id.toString(), _id: undefined });
    }
  },
  {
    name: 'list_documents',
    config: {
      title: 'List tailored documents',
      description:
        'List the documents you have tailored, with their template, application status, next action and follow-up date.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe('How many to return. Default 20.')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async run(user, args) {
      const docs = await TailoredDocument.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(args.limit || 20)
        .select('jobTitle company template status nextAction followUpDate createdAt')
        .lean();

      return asJson({
        count: docs.length,
        documents: docs.map(d => ({
          id: d._id.toString(),
          jobTitle: d.jobTitle,
          company: d.company,
          template: d.template,
          status: d.status,
          nextAction: d.nextAction,
          followUpDate: d.followUpDate,
          createdAt: d.createdAt
        }))
      });
    }
  },
  {
    name: 'set_application_status',
    config: {
      title: 'Update an application',
      description:
        'Update the application tracker fields on one of your documents: status, company, the next action you have to take, and when to follow up. This writes. It never changes the CV text.',
      inputSchema: {
        documentId: DOCUMENT_ID.describe('Which document to update.'),
        status: z.enum(['saved', 'applied', 'interview', 'offer', 'rejected']).optional(),
        company: z.string().max(120).optional(),
        nextAction: z.string().max(200).optional().describe('Free text. What you have to do next.'),
        followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, or an empty string to clear.')
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async run(user, args) {
      const updates = {};
      if (args.status !== undefined) updates.status = args.status;
      if (args.company !== undefined) updates.company = args.company;
      if (args.nextAction !== undefined) updates.nextAction = args.nextAction;
      if (args.followUpDate !== undefined) {
        updates.followUpDate = args.followUpDate === '' ? null : new Date(`${args.followUpDate}T00:00:00.000Z`);
      }

      if (Object.keys(updates).length === 0) {
        throw toolError('Nothing to update. Give at least one of status, company, nextAction, followUpDate.');
      }

      if (updates.followUpDate !== undefined && updates.followUpDate !== null) {
        // Round-trip, because the regex only proves the *shape* of the date. It
        // happily accepts 2026-02-30, and Date silently rolls that over to 1 March --
        // so the follow-up lands three days early and nobody finds out. Checking the
        // parsed date's own components are the ones that were sent is the version
        // that cannot be rolled over. (Number.isNaN on a Date is always false, which
        // is why it cannot be used here at all.)
        const sent = args.followUpDate;
        const parsed = updates.followUpDate;
        if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(sent)) {
          throw toolError(`followUpDate "${sent}" is not a real date.`);
        }
      }

      const doc = await TailoredDocument.findOneAndUpdate(
        { _id: args.documentId, userId: user._id },
        { $set: updates },
        { new: true }
      ).select('jobTitle company status nextAction followUpDate updatedAt');

      if (!doc) throw toolError('No such document. Use list_documents to see yours.');

      return asJson({
        updated: true,
        id: doc._id.toString(),
        jobTitle: doc.jobTitle,
        company: doc.company,
        status: doc.status,
        nextAction: doc.nextAction,
        followUpDate: doc.followUpDate
      });
    }
  }
];

async function resolveJobText(args) {
  const hasText = typeof args.jobText === 'string' && args.jobText.trim().length > 0;

  if (hasText && args.jobId) {
    throw toolError('Give either jobText or jobId, not both.');
  }
  if (hasText) {
    if (args.jobText.length > JOB_TEXT_MAX) {
      throw toolError(`jobText is ${args.jobText.length} characters; the limit is ${JOB_TEXT_MAX}.`);
    }
    return args.jobText.trim();
  }
  if (!args.jobId) {
    throw toolError('Provide jobText with the posting, or jobId to use a listing from the job board.');
  }

  const job = await Job.findOne({ _id: args.jobId, active: true }).lean();
  if (!job) throw toolError('No such listing. It may have expired; use list_jobs for current ones.');
  if (!job.description) throw toolError('That listing has no job description text.');
  return job.description;
}

module.exports = { TOOLS, resolveCvSource, cvTextFromDocument, CV_TEXT_MAX, JOB_TEXT_MAX };