# CVBoost (cvbuilder) Session Anchor

## Objective
Keep the CVBoost app working end-to-end on the local backend (production mode, port **5001**) + a user-tunneled ngrok URL, and fix the recurring blank-screen / Google-sign-in failures. Long-term goal remains a Render deploy.

## Current State (last verified 2026-08-09)
- Backend running in production mode on **5001** (pid 26036; serves `frontend/dist` + `/api`). NODE_ENV=production. `app.set('trust proxy', 1)` set.
- ngrok started BY ME as a detached background process (pid 55388) because the user's session had died; **public URL re-used the SAME subdomain: `https://unpenetratingly-pansophical-lucila.ngrok-free.dev`**. It is stable until stopped. If the user prefers manual, they may stop this one and start `ngrok http 5001` — if the URL changes, Google Cloud origins + redirect URI must be updated.
- Tunnel verified: `/` 200 (new bundle `assets/index-0hxjWU42.js`), `/sw.js` = `cvboost-v3`, `/api/health` 200.
- **Google sign-in is now REDIRECT mode with a SERVER-SIDE login endpoint.** Google form-POSTs the ID token to `login_uri` = `https://<tunnel>/api/auth/google-redirect` (`POST`, `application/x-www-form-urlencoded`, field `credential`). New backend handler `authController.googleRedirect` verifies the token (shared helper `verifyGoogleCredential`), sets session cookies, then 303-redirects to `/dashboard` (failures → `/login?error=google_signin_failed`). Route registered in `routes/auth.js` (post `/google-redirect`). CSRF skips `/api/auth/*` so the form POST passes.
- **ROOT CAUSE of "Invalid CSRF token" black page:** Google redirect mode POSTs the form to `login_uri`; when that was `/login` (a frontend route), `csrfProtection` 403'd the bare POST. Fixed by pointing `login_uri` at the real API endpoint.
- `agreed` checkbox persisted via `sessionStorage['cvboost_agreed']` (LoginPage/RegisterPage) — still harmless.
- **DONE:** User registered the exact redirect URI in Google Cloud (`.../api/auth/google-redirect` on the Web client `1017265719941-qaemc7bcv5hb6svp7i37ck3i427dnemu`). **Google sign-in is CONFIRMED WORKING end-to-end** (2026-08-08): redirect to Google → form POST → server verify → 303 to /dashboard. The earlier `redirect_uri_mismatch` was a registration/location issue in the console; checklist for such errors lives in the session history.
- Backend restarted 2026-08-08 ~13:02 in NODE_ENV=production (pid 58936; owns port 5001). NOTE: restarts MUST set `NODE_ENV=production` or the static frontend block (server.js:170) is skipped → `Cannot GET /`.
- SW hardened: `frontend/public/sw.js` cache name `cvboost-v3`; install precache wrapped in `.catch(()=>{})` so flaky-network install can't crash (was crashing at `cache.addAll`, leaving stale SW controlling pages → blank screens).
- Unpaid downloads are now watermarked instead of a hard 402: PDF rotated overlay / DOCX header text ("FREE PREVIEW" / "APERÇU GRATUIT"), `X-Watermarked` header drives toasts + upgrade CTA; subscribers/credit/paid-doc users get clean files.
- Mobile (<768px): visiting `/` redirects to `/login` (or `/dashboard` when logged in) instead of the landing page.
- Frontend rebuilt (2026-08-08): `npm run build` in `frontend/`; dist updated.

## Root Causes Found This Session
- **Cloudflare WARP** was the big one: intercepting all DNS/traffic via `127.0.0.2/127.0.2.2`, flapping → intermittent `ERR_NAME_NOT_RESOLVED`, `ERR_SOCKET_NOT_CONNECTED`, `ERR_HTTP2_PROTOCOL_ERROR`, SSL handshake failures, and "slow network" on Google assets. User disconnected WARP (`warp-cli` shows "Disconnected"); DNS now goes to router `192.168.243.81`. If re-enabled, recommend split-tunnel exclusions for Google domains.
- ngrok session kept dying → ngrok offline page (`ERR_NGROK_3200`) showed in browser; confused with app blank screen.
- 401 in console = routine `GET /api/auth/me` when logged out (expected/benign).

## Google sign-in flow (redirect mode now)
1. LoginPage/RegisterPage init GIS: `accounts.google.com/gsi/client` script + `ux_mode:'redirect'`, `login_uri` = `origin/login`.
2. User clicks button → browser navigates to Google → consent → redirects back to `/login#credential=...`.
3. GIS callback fires → `handleGoogleCredential` (gated on `sessionStorage['cvboost_agreed']`) → `POST /api/auth/google-login` with the credential.
4. `backend/controllers/authController.js:396` verifies ID token with `GOOGLE_CLIENT_ID`; on success returns JWT (httpOnly cookie).

## Config facts
- Client IDs match exactly (73 chars) in `frontend/.env` `VITE_GOOGLE_CLIENT_ID` and `backend/.env` `GOOGLE_CLIENT_ID`.
- Backend `.env`: PORT=5001, JOB_SCRAPE_KEY, GOOGLE_CLIENT_ID. Frontend `.env`: VITE_GOOGLE_CLIENT_ID, VITE_POSTHOG_KEY.
- GitHub Actions `jobs-scrape.yml`: cron `'17 */6 * * *'`, POSTs `{{ vars.APP_URL }}/api/jobs/scrape` with `x-scrape-key` = `secrets.JOB_SCRAPE_KEY`. Neither set yet — requires manual web-UI config (no `gh` CLI).
- `frontend/index.html` CSP allows `https://us-assets.i.posthog.com` script-src (PostHog surveys).

## Outstanding / Known issues
- Louma source scrapes time out (20s) — unresolved.
- GitHub Actions variables/secrets not configured.
- No Render deployment yet (do this; then APP_URL = Render URL, update Google origins + redirect URI).

## Relevant Files
- `backend/server.js` (dotenv path, trust proxy, static dist, prod mode)
- `backend/.env`, `frontend/.env`
- `frontend/public/sw.js` (v3, hardened install)
- `frontend/src/utils/googleSignIn.js` (redirect mode)
- `frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx` (sessionStorage agreed)
- `backend/services/jobScraper.js` (pacing, enrichment, JOB_ENRICH_MAX)
- `backend/controllers/authController.js` (googleLogin at :396)
- `.github/workflows/jobs-scrape.yml`
- Independent: user's `communitypulse` vite on 4173 — untouched.

## Commands
- Backend: `cd backend; $env:NODE_ENV='production'; node server.js` (logs to backend-fix2.log / backend-fix2-err.log in Temp\opencode).
- Frontend build: `cd frontend; npm run build`.
- ngrok: `ngrok http 5001`; local API `http://127.0.0.1:4040/api/tunnels`.
- Tests: backend `npm test` (63/63 pass as of 2026-08-09; adds watermark PDF/DOCX + `resolveAccess`/`X-Watermarked` controller tests incl. a frontend-label drift guard).
