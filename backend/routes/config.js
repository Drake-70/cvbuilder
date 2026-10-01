const express = require('express');
const router = express.Router();

/**
 * Runtime config for values the browser needs.
 *
 * The Google client ID used to reach the frontend as VITE_GOOGLE_CLIENT_ID,
 * which Vite inlines at build time. That works only when the build happens
 * somewhere env vars are visible. On Render's Docker runtime the build runs
 * inside `docker build`, where they are not, so the variable was always empty
 * and the "Continue with Google" button silently never rendered.
 *
 * Reading it from the server at runtime fixes that permanently and means
 * changing the client ID no longer needs a frontend rebuild.
 *
 * Unauthenticated by necessity: the login and register pages need this before
 * anyone has a session. Everything returned here is already public by
 * construction -- an OAuth client ID is a browser-visible identifier, not a
 * secret, and Google requires it in the client.
 */
router.get('/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    appEnv: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;