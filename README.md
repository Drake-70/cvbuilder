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

- Node.js 18+
- MongoDB (local or Atlas)
- Groq API key (https://console.groq.com)
- CamPay account (sandbox for testing)

## Setup

### 1. Clone & install

```bash
git clone <repo-url> cvboost
cd cvboost

# Backend
cd backend
cp ../.env.example .env  # then edit with your keys
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure `.env` (backend)

Edit `backend/.env` with your values:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Random string for access tokens |
| `JWT_REFRESH_SECRET` | Random string for refresh tokens |
| `GROQ_API_KEY` | From console.groq.com |
| `CORS_ORIGIN` | Frontend URL (http://localhost:5173) |
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
cvboost/
├── backend/
│   ├── config/          # db.js, pricing.js
│   ├── controllers/     # auth, cv, tailor, document, payment, interview
│   ├── middleware/       # requireAuth, errorHandler, requirePayment, sanitize
│   ├── models/          # User, CV, TailoredDocument, Payment
│   ├── routes/          # auth, cv, tailor, document, payment, interview
│   ├── services/        # aiService, documentService, paymentService
│   ├── utils/           # logger
│   ├── __tests__/       # Jest tests
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/  # Header, PathChoice, UploadStep, BuildStep, etc.
│       ├── contexts/    # AuthContext
│       ├── locales/     # en/ and fr/ translation JSONs
│       ├── pages/       # Landing, Login, Register, Dashboard, Tailor, Pricing
│       ├── services/    # api.js (axios with token refresh)
│       └── App.jsx
└── .env.example
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

## Testing

```bash
cd backend
npm test
```

## Pricing (configurable in `config/pricing.js`)

| Tier | Price | Includes |
|---|---|---|
| One-time | 500 XAF | 1 tailored CV + cover letter download |
| Subscription | 3,000 XAF/mo | Unlimited tailoring + downloads + interview prep |

## License

ISC
