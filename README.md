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
| `CORS_ORIGIN` | Frontend URL (http://localhost:5173 in dev) |
| `FRONTEND_URL` | Base URL used in password-reset / verification emails |
| `CAMPAY_SANDBOX_USERNAME` | CamPay sandbox username |
| `CAMPAY_SANDBOX_PASSWORD` | CamPay sandbox password |

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
- `CORS_ORIGIN` and `FRONTEND_URL` both resolve from the service's own
  `RENDER_EXTERNAL_URL`, so password-reset and verification emails point at the
  deployed origin with no manual editing.
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
