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
would otherwise turn into a hostname of `rediss`), and surrounding quotes. A
password containing `/`, `?`, `#`, `[`, `]` or a bare `%` must be percent-encoded
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
`"cache":"memory"`, which is the case worth catching. If the endpoint never
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
- **.docx Download** — ATS-friendly Word documents (FR + EN templates)
- **Payment Gate** — CamPay (MTN MoMo / Orange Money) for downloads
- **Subscription** — Monthly unlimited tier
- **Interview Prep** — AI-generated STAR-method questions (subscribers)
- **Job Board** — Auto-scraped Cameroonian listings (Go Africa, Louma, MyJobMag, Emploi) with category filters and email alerts
- **Bilingual** — Full French/English with browser auto-detection

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user

### CV
- `POST /api/cv/upload` — Upload file (PDF/DOCX/TXT)
- `POST /api/cv/paste` — Paste CV text
- `POST /api/cv/build` — Build from questionnaire
- `POST /api/cv/save` — Save base CV
- `GET /api/cv/list` — List saved CVs

### Tailoring
- `POST /api/tailor` — Tailor CV to job description

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

### Interview
- `POST /api/interview-prep` — Generate questions (subscribers)

### Jobs
- `GET /api/jobs` — List scraped jobs (filter by `source`, `category`, `q`, `page`)
- `GET /api/jobs/:id` — Single job
- `POST /api/jobs/scrape` — Run a scrape cycle (admin session **or** `x-scrape-key` header)
- `GET /api/jobs/alerts` / `POST /api/jobs/alerts` — Job alert subscriptions

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
