const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { TOOLS } = require('./tools');
const logger = require('../utils/logger');

const SERVER_NAME = 'cvboost';
const SERVER_VERSION = require('../package.json').version;

// Bumped only for a breaking change in the tool contract. Tool *additions* do not
// need it: a client that ignores an unknown tool still works, whereas a client
// pinned to an old version would be refused outright.
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Build a server with every tool registered, bound to the authenticated user.
 *
 * A new server per request, which is what makes the stateless transport below
 * possible. The tool closures capture `user` rather than reading it off a request
 * object, because the SDK calls a tool with only its arguments -- so the identity
 * has to be captured at construction or a tool would have no way to tell whose data
 * it is allowed to read.
 */
function createServer(user) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'CVBoost tailors CVs to job descriptions and scores them.\n\n' +
        'Two different questions have two different tools, and the distinction matters:\n' +
        '- score_resume judges a CV on its own merits. It takes no job description, because a score ' +
        'that depends on a posting is a different number wearing the same name.\n' +
        '- match_job judges a CV against one specific posting and returns the keywords it is missing.\n\n' +
        'tailor_cv returns proposals and saves nothing. To persist a tailored CV, the user does it in ' +
        'the app, where they can see the before and after side by side.\n\n' +
        'set_application_status is the only tool that writes, and it only touches the application ' +
        'tracker -- never the CV text.'
    }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { ...tool.config, _meta: { protocolVersion: PROTOCOL_VERSION } },
      async (args) => {
        try {
          return await tool.run(user, args || {});
        } catch (err) {
          // Returned as an isError result rather than rethrown. An exception here
          // becomes a JSON-RPC protocol error, which most clients surface as a
          // transport failure and leaves the model with nothing actionable; an
          // isError result carries the message into the conversation, where the
          // model can correct the call.
          logger.warn(`MCP tool ${tool.name} failed: %s`, err.message);
          return {
            isError: true,
            content: [{ type: 'text', text: err.message || 'The tool failed.' }]
          };
        }
      }
    );
  }

  return server;
}

/**
 * A transport for one request.
 *
 * sessionIdGenerator: undefined is the documented way to ask for stateless mode:
 * no session id in responses, no session validation, nothing kept in memory between
 * requests. That is the right mode here for two reasons. The tools hold no state, so
 * a session would buy nothing; and Render can run several instances behind a load
 * balancer, where a stateful server hands out a session id and the next request
 * lands on a different instance that has never heard of it. Stateless is the only
 * mode that works without sticky sessions.
 *
 * enableJsonResponse makes the transport answer with `application/json` instead of
 * an SSE stream. Both are legal, and the default is SSE -- but this app mounts
 * compression() globally, and compression buffers a response stream until it can
 * compress it, which holds a streamable-HTTP response open indefinitely instead of
 * letting it complete. Nothing here needs streaming: every tool is a single
 * request answered by a single result, so there is no long-lived stream to keep
 * alive and no server-initiated message to interleave.
 */
function createTransport() {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
}

/**
 * Handle one MCP request.
 *
 * The transport is connected to a fresh server and closed in a finally, because in
 * stateless mode nothing closes it for us. Leaking one transport per request would
 * hold its listeners for the life of the process.
 *
 * The body arrives already parsed: Express reads it before the route runs, and the
 * transport accepts it directly rather than re-reading a consumed stream.
 */
async function handleRequest(req, res) {
  const server = createServer(req.user);
  const transport = createTransport();

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error('MCP request failed: %s', err.stack || err.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: req.body && req.body.id !== undefined ? req.body.id : null
      });
    }
  } finally {
    await server.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

module.exports = { createServer, createTransport, handleRequest, SERVER_NAME, SERVER_VERSION, PROTOCOL_VERSION };