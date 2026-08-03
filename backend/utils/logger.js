const winston = require('winston');
const path = require('path');

const logDir = process.env.LOG_DIR || 'logs';

/**
 * Batched HTTP transport that ships JSON logs to BetterStack Logs
 * (https://in.logs.betterstack.com/{source-token}). Non-blocking: logs are
 * queued and flushed every few seconds or when the queue fills; failures are
 * silently dropped so logging never affects the request path.
 */
class BetterStackTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.token = opts.token;
    this.queue = [];
    this.flushing = false;
    this.timer = setInterval(() => this.flush(), opts.flushIntervalMs || 5000);
    if (this.timer.unref) this.timer.unref();
  }

  log(info, callback) {
    this.queue.push(info);
    if (this.queue.length >= (this.maxBatchSize || 25)) this.flush();
    callback();
  }

  close() {
    clearInterval(this.timer);
    this.flush();
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await fetch(`https://in.logs.betterstack.com/${this.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: batch.map((entry) => JSON.stringify(entry)).join('\n')
      });
    } catch {
      // Never let log shipping take down the app
    } finally {
      this.flushing = false;
    }
  }
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'cvboost' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    })
  ]
});

if (process.env.BETTERSTACK_SOURCE_TOKEN) {
  logger.add(new BetterStackTransport({ token: process.env.BETTERSTACK_SOURCE_TOKEN }));
}

if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5 * 1024 * 1024,
    maxFiles: 5
  }));
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 10 * 1024 * 1024,
    maxFiles: 10
  }));
}

module.exports = logger;
