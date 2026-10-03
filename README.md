# CVBoost

AI-powered CV tailoring for Cameroon's job market. Upload your CV, paste a job description, and get a tailored CV + cover letter in seconds.

## Tech Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Frontend:** React 19, Vite, Tailwind CSS v4
- **AI:** Groq API (LLaMA 3.1 70B)
- **Payments:** CamPay (MTN MoMo + Orange Money)
- **Auth:** JWT via httpOnly cookies
- **i18n:** French + English

## Prerequisites

- Node.js 22 (see `.nvmrc`; `nvm use`)
- MongoDB (local or Atlas)
- Groq API key (https://console.groq.com)
- CamPay account (sandbox for testing)

## Setup

### 1. Clone & install

```bash
git clone <repo-url> cvboost
cd cvboost
npm run install:all
```

### 2. Configure `.env` (backend)

```bash
cd backend
cp .env.example .env   # backend/.env.example is the complete reference
```

`backend/.env.example` documents every variable the server reads, including the
job-scraper and payment-provider keys. `frontend/.env.example` covers the
build-time `VITE_*` keys — note that anything in a `VITE_` key is inlined into
the public browser bundle, so never put a secret in one.

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Random string for access tokens |
| `JWT_REFRESH_SECRET` | Random string for refresh tokens |
| `GROQ_API_KEY` | From console.groq.com |
| `REDIS_URL` | Optional. Upstash `rediss://` URL (not the `https://` REST endpoint). Backs the response cache, rate-limit counters and job-scrape lock; all three fall back to per-process memory when unset or unusable |
| `CORS_ORIGIN` | Frontend URL (http://localhost:5173 in dev) |
| `FRONTEND_URL` | Base URL used in password-reset / verification emails |
| `CAMPAY_SANDBOX_USERNAME` | CamPay sandbox username |
| `CAMPAY_SANDBOX_PASSWORD` | CamPay sandbox password |

`REDIS_URL` notes: the value must be **only the `rediss://` connection string**,
not the `redis-cli -u rediss://…` command that the Upstash console displays as
its main connect snippet, and not the `https://…upstash.io` REST endpoint.
ioredis parses the REST endpoint without complaint and treats the literal
string `https` as the hostname, giving a client that can never connect.

These paste mistakes are corrected automatically and reported on one line
without echoing the password:

```
[warn]: [redis] REDIS_URL needed repair (a pasted redis-cli command + surrounding whitespace); using the corrected value (70 -> 47 chars)
```

Repairs applied: a pasted `redis-cli` invocation, surrounding whitespace
(including a leading tab, newline or non-breaking space, which Node's URL parser
would otherwise turn into a hostname of `rediss`), surrounding quotes, and a
plaintext `redis://` scheme against an Upstash host. Each repair is named
individually, because naming the wrong one is worse than naming none.

That last repair is worth its own note. Upstash will not speak plaintext on
6379, and ioredis only enables TLS for `rediss://`, so a `redis://` value opens a
plain socket that is dropped with no handshake, no error and no `ready`. The
symptom is a health body reporting `"cache":"memory"` alongside a startup line
saying `redis=configured`, and nothing in the log to act on. Verified against a
live instance: `redis://` fails with `Connection is closed`, while the same
credentials over `rediss://` return `PONG`. The rewrite is scoped to `*.upstash.io`
and `*.upstash-redis.com`; a plain `redis://` against any other host is left alone,
because that is legitimate for a local or self-hosted Redis.

A password containing `/`, `?`, `#`, `[`, `]` or a bare `%` must be percent-encoded
and is **not** auto-corrected — it is reported, because as written those
characters end the host part of the URL.

A value that still cannot be used is named on one line and the app falls back to
in-process state:

```
[error]: [redis] REDIS_URL could not be parsed (…) — cache, rate-limit counters and scrape lock stay in-process
```

Confirm it is live with `[redis] connected to <host>:6379 (TLS)` in the logs, or
`redis=configured` on the `startup:` line plus `"cache":"redis"` in the
`/api/health` body. The health body reports the *live* backend, not whether
`REDIS_URL` parses — a URL that is accepted but cannot connect reports
`"cache":"memory"`, which is the case worth catching.

When it is `"memory"`, a `redis` object in the same body says why:

```json
{"cache":"memory","redis":{"ok":false,"state":"connecting","error":"getaddrinfo ENOTFOUND ..."}}
```

`state` is either the ioredis connection state (`connecting`, `reconnecting`,
`end`, `close`) or one of `not-configured` (no `REDIS_URL` — set the variable)
and `invalid-url` (present but wrong — fix the value). `error` carries the last
failure, redacted of credentials and truncated. The distinction matters: those
two states need different fixes, and the startup line's `redis=off` reports both
identically. Errors are logged at most once a minute, so this is sometimes the
only record of why Redis is down.

If the endpoint never
answers at all, the first failure says so explicitly rather than being folded
into the once-a-minute warning:

```
[error]: [redis] never connected (read ECONNRESET) — check the host, the TLS scheme and the password.
```

The rate-limit store binds to Redis on **first use**, not at require time.
`RedisStore.init()` issues a `SCRIPT LOAD` the moment the store exists, and
`config/redis` runs with `enableOfflineQueue: false`, so a store built during
boot has that script load rejected — and `init()` caches the rejected promise as
`incrementScriptSha`, which every later `increment()` awaits. With
`passOnStoreError` that silently disables rate limiting for the life of the
process. Until Redis is ready the limiters count in memory instead, and a bind
that fails is discarded rather than cached, so it is retried on the next
request. See `backend/middleware/rateLimitStore.js`.

### 3. Run

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

## Project Structure

```
cvbuilder/
├── backend/
│   ├── config/          # db.js, posthog.js, pricing.js
│   ├── controllers/     # auth, cv, tailor, document, payment, job, admin, …
│   ├── middleware/      # requireAuth, optionalAuth, errorHandler, csrf, cache, sanitize
│   ├── models/          # User, CV, TailoredDocument, Payment, Job, JobAlert, Notification
│   ├── routes/          # auth, cv, tailor, document, payment, jobs, admin, …
│   ├── services/        # aiService, documentService, paymentService, jobScraper, emailService
│   ├── tests/           # node --test unit tests
│   ├── utils/           # logger
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/  # Header, PathChoice, UploadStep, BuildStep, etc.
│       ├── contexts/    # AuthContext
│       ├── locales/     # en/ and fr/ translation JSONs
│       ├── pages/       # Landing, Login, Register, Dashboard, Tailor, Pricing, Jobs, Admin
│       ├── services/    # api.js (axios with token refresh)
│       └── App.jsx
├── e2e/                 # Playwright specs
├── render.yaml          # Render Blueprint
├── Dockerfile
├── docker-compose.yml
└── .nvmrc
```

## Features

- **CV Upload** — PDF, DOCX, or paste text
- **CV Build** — Guided questionnaire for users without an existing CV
- **AI Tailoring** — Groq-powered CV rewriting + cover letter generation
- **Gap Analysis** — Missing keywords/skills identified from job posting
- **Resume Quality Score** — Six-category report on a bare CV, no job description needed
- **.docx Download** — ATS-friendly Word documents (FR + EN templates)
- **Payment Gate** — CamPay (MTN MoMo / Orange Money) for downloads
- **Subscription** — Monthly unlimited tier
- **Interview Prep** — AI-generated STAR-method questions (subscribers)
- **Job Board** — Auto-scraped Cameroonian listings (Go Africa, Louma, MyJobMag, Emploi) with category filters and email alerts
- **Bilingual** — Full French/English with browser auto-detection
- **Email Verification** — Six-digit code *and* a 24-hour link in one message

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `POST /api/auth/verify-email-code` — Verify with a six-digit code
- `GET /api/auth/verification-status` — Code expiry, attempts left, resend cooldown
- `POST /api/auth/resend-verification` — Send a fresh code and link

#### Email verification

One email carries **both** a six-digit code and the existing 24-hour link, as
GitHub does. The link works on a phone with no way to retype digits; the code works
on a desktop where clicking a link would abandon whatever the user was doing.
Neither route is a fallback for the other — each is a first-class way through, and
either one marks the account verified and invalidates the other credential.

The rules live in `backend/services/verificationCode.js` so they can be tested
without a database and cannot be changed from two places at once. Three properties
are worth stating, because a six-digit code is a different security problem from a
256-bit token:

- **The code is stored as a bcrypt hash, never a digest.** A link token can be
  SHA-256'd because brute-forcing 2^256 values is impossible; hashing a million-value
  code the same way produces a value that is reversible from a stolen database in
  microseconds. That would be storing the plaintext with extra steps.
- **Five attempts per issued code, then it is dead**, with the attempt counter
  living on the user document rather than in Redis — so the cap survives a Redis
  outage and cannot be reset by clearing a cache. Issuing a new code resets the
  counter, which is the one case where that is correct rather than dangerous: the
  previous code is gone, so its spent attempts no longer say anything about the new
  one.
- **The endpoint requires a session and only ever loads that user's own record.**
  A `findOne({ code })` lookup would make the response an oracle confirming which
  addresses are registered. Looking up `req.user._id` cannot, and the test asserts
  that `findOne` is never called.

The code lives 10 minutes against the link's 24 hours — a code is typed by someone
who just signed up, and a long window only widens the exposure of a code read over
a shoulder or left in a screenshot. `GET /auth/verification-status` exists so the
page counts down from the server's view of that expiry, attempt count and resend
cooldown instead of keeping its own copy of the rules; it returns the *shape* of
the code's state and never the hash or the code.

Resends and guesses are rate limited separately: six resends per hour and twenty
guesses per fifteen minutes, mounted ahead of the auth router in `server.js`. One
shared budget would let a resend storm starve the code box, and guessing is a
different abuse from mail-bombing.

### CV
- `POST /api/cv/upload` — Upload file (PDF/DOCX/TXT)
- `POST /api/cv/paste` — Paste CV text
- `POST /api/cv/build` — Build from questionnaire
- `POST /api/cv/expand-bullets` — Propose professional rewrites for typed lines
- `POST /api/cv/save` — Save base CV
- `GET /api/cv/list` — List saved CVs

#### A rewrite proposal is not a rewrite

`/expand-bullets` returns **proposals**, not a replacement CV:

```jsonc
{ "proposals": [ { "index": 0, "before": "helped at my mum's cafe", "after": "Managed daily cafe operations" },
                 { "index": 1, "before": "did python in class",    "after": null } ],
  "expandedCount": 1 }
```

Nothing is written. `BulletApproval.jsx` shows each line beside its rewrite,
accepted by default and individually reversible, and only touches the form on Apply.

- **The pairing is explicit and server-side.** The model is asked to echo an
  `index`, and `bulletExpansionService.pairExpansions` reconciles it. Zipping
  request and response by array position would let a reordered or dropped item
  rewrite the wrong line — and that failure is invisible, because the CV still
  looks plausible. The index base is inferred rather than assumed: models return
  0-based indices often enough that hard-coding either convention shifts every
  rewrite by one line.
- **The response is always aligned to the request**, same length, same order. A line
  the model declined comes back as `after: null` rather than being dropped, so the
  client never reconciles two lists. `null` means "your wording is still your
  wording" — it is displayed as such, never as a removal.
- **A proposal longer than a bullet is discarded.** One sentence was requested; a
  paragraph is drift, and writing it into a CV the user is about to submit is worse
  than leaving their own line alone.
- **An echoed input is not offered.** If the model returns the input back, the panel
  reports it as `kept` rather than counting it as work the AI did. For the same
  reason `original` is not an accepted response field.
- **A failure is no longer silent.** The old handler caught the error and returned
  nothing, making a failure indistinguishable from a button that does nothing.

### Tailoring
- `POST /api/tailor` — Tailor CV to job description

#### Nothing is saved until the user approves it

`POST /api/tailor` performs no persistence at all; the controller writes nothing.
The client used to save the document immediately afterwards and swallowed the save
error as "Non-critical", which made review decorative — by the time a user read the
result, the CV was already in their library, and a failed write left them believing
it was not.

`frontend/src/components/ChangeReview.jsx` is now the first tab of the result step
and the only place the save button lives.

- `frontend/src/utils/cvDiff.js` pairs original and tailored bullets by token
  similarity and labels each `kept` / `reworded` / `added` / `removed`. Punctuation
  and casing do not make a bullet look changed. Below 0.5 similarity a line is
  reported as removed-plus-added, which is the honest reading: the AI replaced that
  line rather than rewording it.
- A CV pasted as plain text has no structured original, so `summarizeDiff` reports
  `incomparable`. The panel says exactly that instead of falling through to "nothing
  changed", a claim it has no evidence for.
- Downloads do not depend on having saved. `generateDocument` resolves access
  against `documentId || null`, so gating the write costs the user nothing.
- `/cv/save` (the *original* CV) stays best-effort. `baseCvId` is optional and
  losing it degrades a linkage rather than a document, so surfacing that error
  would be noise. `changeReview.test.js` scopes its assertions to that distinction.

#### Drafts
One draft per user, autosaved by the tailor wizard. `step` is validated against an
allow-list (`choose`, `upload`, `build`, `job` — `result` is excluded because it
cannot be restored into) and a `build` step must carry its `buildState`, which is
what makes a questionnaire draft resumable rather than an empty shell.

- `GET /api/drafts` — Read the draft. Always returns `resumable`, the server's own
  verdict on whether the draft holds anything worth reopening.
- `PUT /api/drafts` — Upsert. Fields are optional; absent ones are left untouched.
- `DELETE /api/drafts` — Discard

`resumable` is true when the draft holds CV text, a job description, a saved CV or
document, a non-empty parsed CV, or a `buildState` containing a typed field, an
added list row, a `subStep` past the first, or a "no education"/"no experience"
answer. A draft that only names a step is never offered as a draft — that is the
case the wizard used to create and then present as something to continue.

The client keeps a mirrored copy of this rule in `frontend/src/utils/draftResume.js`;
`backend/tests/draftController.test.js` asserts the two agree, so the two cannot
drift apart silently.

### Documents
- `POST /api/document/generate` — Generate .docx (preview)
- `POST /api/document/save` — Save tailored document
- `GET /api/document/list` — List documents
- `GET /api/document/:id/download` — Download .docx (payment-gated)

### Payments
- `GET /api/payments/pricing` — Get pricing info
- `POST /api/payments/initiate` — Start payment
- `GET /api/payments/status/:id` — Check payment status
- `POST /api/payments/webhook` — CamPay callback

### Scoring
- `POST /api/score` — Job-match score. **Requires** `jobDescription`
- `POST /api/score/resume` — Resume-quality score. Needs no job description

#### Two scores, not one

`/api/score` and `/api/score/resume` are deliberately separate endpoints with
separate response shapes (`breakdown` vs `categories`), because they answer
different questions and are only reachable on different paths.

`/api/score` measures the distance between two documents — keywords, skills,
gaps, structure. All four sub-scores are job-relative, so it has nothing to say
without a job description and returns `400` without one. On the tailor flow that
meant a user who took *Skip job description* got no score at all.

`/api/score/resume` judges a CV on its own, across six categories that are
mostly job-independent: `contact` (10), `structure` (25), `impact` (25),
`verbs` (15), `brevity` (15), `language` (10). It makes **no AI call**, so it is
free and cannot fail for reasons unrelated to the user's CV.

Findings are returned as **codes**, never as sentences:

```jsonc
{ "code": "impact.few_quantified", "params": { "count": 2, "total": 7 }, "points": 12 }
```

The scorer has no idea which language the UI is in, so any prose it emitted
would be permanently untranslated. `resumeScoreContract.test.js` asserts against
the real `en/tailor.json` and `fr/tailor.json` that every code it can emit exists
in both, that the two languages interpolate the same variables, and that every
variable a translation uses is one the finding actually sends.

Two constraints worth preserving when editing this service:

- **Bullets are found by section, not by length.** Only achievement sections
  count. An earlier length heuristic swept in the contact line, the summary,
  every job title and the education entry, putting 8 lines in the denominator
  where 3 were real bullets — so 3 fully quantified achievements scored 25%.
- **Contact patterns have bounded quantifiers.** Unbounded
  `[a-z0-9._%+-]+@` took 5.6 seconds on 50KB of letters (quadratic backtracking
  with no `@` present), which is exactly what a pasted CV paragraph looks like.
  `resumeScore.test.js` asserts both structurally and by timing.

### Interview
- `POST /api/interview-prep` — Generate questions (subscribers)

### Jobs
- `GET /api/jobs` — List scraped jobs (filter by `source`, `category`, `q`, `page`)
- `GET /api/jobs/:id` — Single job
- `POST /api/jobs/match` — Match one saved CV against up to 50 postings
- `POST /api/jobs/scrape` — Run a scrape cycle (admin session **or** `x-scrape-key` header)
- `GET /api/jobs/alerts` / `POST /api/jobs/alerts` — Job alert subscriptions

#### The match badge, and what it refuses to say

`POST /api/jobs/match` takes `{ jobIds, cvId? }` and returns a map of
`computeJobMatchScore` results. It is a batch endpoint rather than one request per
posting because a board page is up to 50 jobs, and the detail page calls the same
endpoint with a single id — one scorer, one shape, so the badge on a card and the
panel on the detail page cannot disagree.

It is **not** `computeATSScore`. Two of that function's four sub-scores cannot be
known here: `structure` reads a tailored CV object and `gaps` reads a gap analysis,
and on the board neither exists. Passing nulls scores structure 0 and gaps 100 for
every user, so the badge would have measured the fact that the board is not the
tailoring flow rather than the fit. This scores the one thing both documents can
answer — whether they talk about the same things — at keywords 60 / skills 40.

Four cases where it declines to produce a number:

- **Too thin a posting.** Below 12 distinct keywords the ratio is noise: at 5, one
  match is worth 20% and the figure turns on how the ad was typed. The response
  carries `score: null` and `insufficient: true` and the UI renders nothing. A
  badge that sometimes means "poor fit" and sometimes means "we could not tell" is
  worse than silence.
- **No named skills.** When the posting names none, skills are dropped from the
  score rather than defaulted to a constant. `breakdown.skills` is `null`, and the
  UI omits that row instead of printing a placeholder measurement.
- **No CV.** `404` with `code: 'no_cv'`, distinguishable by the client from any
  other failure.
- **Which CV.** Resolved from `cvId` or the most recent, and returned in the
  response. It changes the number, so it is never chosen silently.

`extractKeywords` excludes job-ad boilerplate — `hiring`, `join`, `team`,
`salary`, `negotiable`, `skills`, `experience` and the rest. Every posting says
them and no CV does, so counting them made an excellent match read as 49%: a
number describing the advertisement rather than the candidate. Terms that
discriminate (`kubernetes`, `mentor`, `optimisation`) are still measured.

Known limitation, asserted in `jobMatchScore.test.js` so it stays visible:
matching is whole-word, so a CV saying "Optimised queries" does not satisfy
"query optimisation". Closing that needs stemming, which trades false positives
("manage" / "manager") for these near-misses — not a change to make silently.

`POST /api/jobs/scrape` returns `409` when a cycle is already in flight, so an
external scheduler can treat both `200` and `409` as success. See
`.github/workflows/jobs-scrape.yml`.

#### Listing expiry

A listing leaves the board once no scrape has seen it for `JOB_EXPIRY_DAYS`
(default 30). The sweep runs at the end of every scrape cycle and reports its
count in the response as `expiry.expired`, so it is visible in the workflow log
and in `GET /api/admin/dashboard` (`stats.activeJobs` / `stats.expiredJobs`).

Three deliberate properties:

- **Age is measured from `scrapedAt` (last seen), not `postedAt`.** Most of these
  boards publish no posting date, so a `postedAt`-based sweep could never age
  those listings out. Worse, it would let a still-listed old job flip between
  active and expired on every cycle, because the scrape reactivates it and the
  sweep immediately expires it again.
- **Expiry is a soft flag, never a delete.** It only sets `active: false` and
  stamps `expiredAt`. Nothing is removed from the database, so `viewCount` and
  `applyCount` are preserved.
- **It is self-healing.** A listing that reappears on its source board gets
  `active: true, expiredAt: null` on the next scrape and comes straight back.

An expired listing still resolves via `GET /api/jobs/:id` with `expired: true`,
so a user who already applied does not have it vanish from under them. The
frontend shows an expired banner and hides the Apply button, and the server
answers `409` if someone starts a *new* application against an expired posting
while still allowing edits to one they already made.

Set `JOB_EXPIRY_DAYS=0` to turn the sweep off without a code change.

### Admin

All routes require an admin session (`requireAdmin`) and are exempt from the email
verification gate, so an unverified admin can still fix verification problems.

#### Getting in

The dashboard is at **`/admin`**, and the header only shows an *Admin* link when
the signed-in user has `role: 'admin'`. If there is no link, that account is not an
admin.

To see who the admins are, or to promote an account when there is no admin left to
do it:

```bash
cd backend
npm run promote:admin                              # list current admins
npm run promote:admin -- you@example.com           # dry run: show what would change
npm run promote:admin -- you@example.com --apply   # actually promote
```

It reads `MONGODB_URI` from `backend/.env`, so run it from `backend/` and check the
host and database name it prints — the account has to already exist, and the script
exits non-zero on a typo rather than appearing to succeed.

This is the only way to create the first admin, and it is deliberately a script
rather than an HTTP endpoint. `PATCH /api/admin/users/:id/role` is the supported
way to change a role, but it sits behind `requireAdmin`, so a fresh database has no
in-product path to its first admin. A `POST /api/admin/bootstrap` guarded by an env
secret would fix that while leaving a standing unauthenticated write path in the
production surface, with only the secrecy of one environment variable between an
attacker and full admin. A script needs shell or database access, so it cannot be
reached from the internet at all.

- `GET /api/admin/dashboard` — counts, **revenue**, and the live system state
- `GET /api/admin/users` — `page`, `limit`, `search`, `role`, `verified`, `subscription`
- `PATCH /api/admin/users/:id/role` — promote / demote
- `PATCH /api/admin/users/:id/verified` — mark verified without sending mail
- `GET /api/admin/payments` — `page`, `limit`, `status`, plus per-status totals
- `GET /api/admin/contacts` — the inbox, with counts per status
- `PATCH /api/admin/contacts/:id/status` — move a message through the workflow

List endpoints share one envelope: `{ <key>, total, page, limit, pages, hasMore }`.
`limit` is clamped to 100 (`backend/utils/paging.js`), so `?limit=1000000` degrades
to a page instead of asking the driver to serialise the whole collection.

Three properties the dashboard depends on:

- **`passwordHash` is never returned.** The exclusion list lives in one place,
  `USER_PRIVATE_FIELDS` in `adminController`, and is asserted against the selects
  actually issued rather than against the constant.
- **The last admin cannot be demoted**, and self-demotion is refused outright —
  `409` for the former, `400` for the latter. Without it, one click on the role
  toggle locks everyone out of the only route that can undo it.
- **Revenue counts `success` only.** A pending payment is money that has not
  arrived, and the totals are aggregated in the database rather than summed in JS.

#### Contact workflow

```
new ──> read ──> replied
 │        │         │
 └────────┴─────────┴──> archived   (from any state, and back)
```

Rules live in `backend/services/contactWorkflow.js` and nowhere else; the
controller validates with them and refuses an illegal move with `409` naming the
current status and the allowed set. `replied` can be reopened because someone who
replies and then receives a follow-up has genuinely unread mail. Reopening does
**not** clear the stored reply or `repliedAt` — only an explicit `clearReply`
does. `reply` records a reply composed elsewhere; nothing is emailed from here,
so the app does not take on delivering it.

`statusChangedBy` / `statusChangedAt` are stamped on every real change. A no-op
does not restamp them, because an audit field that says a message was just handled
when nothing happened is worse than a stale one.

## Testing

```bash
# Backend unit tests (node --test)
cd backend && npm test

# Frontend lint
cd frontend && npm run lint

# End-to-end (needs a running backend + frontend)
npx playwright test
```

CI (`.github/workflows/ci.yml`) runs the backend tests, frontend lint + build,
the Playwright specs, and a `deploy-readiness` job that builds the Docker image
and asserts the container reports healthy.

There is no frontend test runner. Behaviour that has to hold on both sides of the
wire — the draft allow-list, the resumability rule, the locale keys the draft UI
asks for — is asserted from the backend suite against the real frontend source
(see `backend/tests/draftController.test.js`), so a frontend change that breaks
the contract fails `npm test` rather than shipping.

Two frontend modules are pure enough to be asserted directly from the backend
suite, which is worth doing for anything that decides what a user is told about
the AI's work: `frontend/src/utils/cvDiff.js` (`cvDiff.test.js`) and the review
panels' wire contracts (`changeReview.test.js`, `bulletReviewContract.test.js`).

## Deployment

### Render (Blueprint)

`render.yaml` is a valid Render Blueprint and provisions a single Node web
service that serves both the API and the built frontend from one origin.

1. Push the repo to GitHub and create a Render Blueprint from it.
2. Fill in every value marked `sync: false` in the Render dashboard — those are
   intentionally unset in the repo.
3. Render builds with `cd frontend && npm ci && npm run build && cd ../backend && npm ci`
   and starts with `node backend/server.js`.

Notes:

- `healthCheckPath` is `/api/health`, which is registered **ahead of** the rate
  limiter on purpose. The general limiter allows 200 requests / 15 min in
  production, but Render probes every few seconds and restarts the instance
  after 60s of failed checks — a rate-limited health endpoint is a restart loop.
- **The HTTP port opens before MongoDB connects**, and `/api/health` answers `200`
  the whole time. Render treats a container that has not opened its port as a
  failed deploy and kills it, so waiting on the database before listening meant a
  slow or paused free-tier Atlas cluster produced `Application exited early` with
  no application log explaining why. The health body reports
  `mongo: connecting | connected | reconnecting`, and a failed connection is
  retried in the background instead of exiting the process.
- Startup logs a presence-only summary (`startup: env=… mongo=… redis=… email=…
  sentry=… push=…`) so a missing or typo'd env var is obvious. No secret values are
  ever printed, and a field that was cleared but left blank or whitespace reads
  as unset rather than configured.
- `email=` on that line is the one to watch. It is `brevo` (real delivery over
  HTTPS), `smtp` (real delivery, which Render's free tier blocks), or `console`,
  where every send is written to the log instead of an inbox. `console` is
  silent from the user's side — signup succeeds, the response says the
  verification link is on its way, and it never arrives. `SMTP_FROM` must match
  a sender already verified in Brevo, or Brevo rejects each message.
- Email delivery failures are reported to the user where that is safe to do so.
  `sendMail` signals failure by resolving `{ success: false }` rather than
  rejecting, so the send call sites check the resolved value; they previously
  used `.catch()`, which could never fire, and `POST /auth/resend-verification`
  answered `200 { message: 'Verification email sent' }` no matter what happened.
  It now returns `502` with the real reason — the caller is the signed-in
  account, so there is no account-enumeration risk. `POST /auth/forgot-password`
  deliberately keeps one identical reply for both outcomes, because reporting a
  delivery failure there would distinguish "account exists but mail is broken"
  from "no such account"; those failures go to the log only.
- `CORS_ORIGIN` and `FRONTEND_URL` are not set by the Blueprint at all. The app
  derives its own public origin from `RENDER_EXTERNAL_URL`, which Render injects
  into every service, so password-reset and verification links point at the
  deployed origin with no manual configuration. This also means a service created
  by hand — which never receives Blueprint `envVars` or `fromService` wiring —
  is still correct. See `backend/config/urls.js`.

  The previous Blueprint set both via `fromService: {envVarKey:
  RENDER_EXTERNAL_URL}` pointing at the service itself. A service created
  manually got neither, so both silently fell back to `http://localhost:5173`
  and every password-reset email in production was a dead link.
- `maxShutdownDelaySeconds: 15` matches the `SIGTERM` handler in
  `backend/server.js`, which drains in-flight requests and flushes logs before
  exiting. Don't lower it below the app's 10s force-exit timer.
- On the free plan the instance sleeps when idle. The in-process job scheduler
  only advances while the process is awake, so pair it with the GitHub Actions
  cron (below) if you need reliable job-board refreshes.

### Docker

```bash
cp backend/.env.example backend/.env   # fill in your keys
docker compose up --build
```

The image is a two-stage build (Node 22 Alpine, matching `.nvmrc`) that compiles
the frontend in the builder stage and ships only `backend/` plus
`frontend/dist` to the runtime stage.

`.dockerignore` uses `**/` prefixes deliberately: Docker matches
`.dockerignore` patterns with Go's `filepath.Match` against paths relative to
the context root, so a bare `.env` or `node_modules` pattern only excludes the
repository-root copy. Without the prefixes, `backend/.env` — which holds live
Atlas, Groq, Google and Gmail credentials — would be shipped to the daemon on
every build.

### Scheduled job scraping

`.github/workflows/jobs-scrape.yml` triggers `POST /api/jobs/scrape` every six
hours. It needs two repository values:

| Type | Name | Purpose |
|---|---|---|
| Actions **variable** | `APP_URL` | Deployed origin, e.g. `https://cvboost.onrender.com` |
| Actions **secret** | `JOB_SCRAPE_KEY` | Must match `JOB_SCRAPE_KEY` on the deployed app |

`APP_URL` is a *variable*, not a secret — it is not sensitive, and the workflow
reads it via `vars.APP_URL`. The job fails with an explicit `::error::` if
either is missing, instead of silently hitting an unauthenticated endpoint.

If `JOB_SCRAPE_KEY` is unset on the app, the route fails closed and only accepts
session-authenticated admins, so an unconfigured cron cannot trigger scrapes.

## Pricing (configurable in `config/pricing.js`)

| Tier | Price | Includes |
|---|---|---|
| One-time | 500 XAF | 1 tailored CV + cover letter download |
| Subscription | 3,000 XAF/mo | Unlimited tailoring + downloads + interview prep |

## License

ISC
