const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { handleRequest } = require('../mcp/server');

/**
 * The MCP endpoint.
 *
 * Mounted at /api/mcp, one path, all three streamable-HTTP methods. The transport
 * decides what each one means; registering them here rather than only POST is what
 * stops a client's SSE probe from landing on the app's catch-all 404 and being
 * reported as a missing server.
 *
 * Auth is an API key, not the session cookie: an MCP client is a program and cannot
 * send an httpOnly cookie, and handing it the session token would mean logging out
 * everywhere to cut off one integration.
 *
 * No rate limiter of its own. generalLimiter already applies -- it is mounted in
 * server.js above every route -- at 200 requests per 15 minutes in production, which
 * is the right order of magnitude here since an MCP conversation is a handful of
 * requests per turn rather than a stream of them. Adding a second, looser limiter
 * would never bind; adding a tighter one would throttle tools/list and tools/call
 * alike. A genuinely tighter cap on the AI-backed tools specifically would need a
 * shared counter, and Redis is optional in this deployment, so it is not pretended
 * at here: an in-process one would reset on every deploy and differ per instance.
 */
router.post('/', apiKeyAuth, handleRequest);
router.get('/', apiKeyAuth, handleRequest);
router.delete('/', apiKeyAuth, handleRequest);

module.exports = router;
