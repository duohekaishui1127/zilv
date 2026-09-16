const { cloud } = require('./db')

function requestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function maskId(value) {
  const s = String(value || '')
  if (s.length <= 8) return s ? '***' : ''
  return `${s.slice(0, 3)}***${s.slice(-4)}`
}

function getLogger() {
  try {
    return typeof cloud.logger === 'function' ? cloud.logger() : console
  } catch (e) {
    return console
  }
}

function log(level, event, extra = {}) {
  const logger = getLogger()
  const fn = logger[level] || logger.log || console.log
  fn.call(logger, '[zilu-api]', { ...event, ...extra })
}

function createRequestContext({ action, userId }) {
  return {
    requestId: requestId(),
    action,
    userId: maskId(userId),
    startedAt: Date.now()
  }
}

function requestSuccess(ctx) {
  log('info', ctx, { status: 'SUCCESS', durationMs: Date.now() - ctx.startedAt })
}

function requestFailure(ctx, error) {
  log('error', ctx, {
    status: 'ERROR',
    durationMs: Date.now() - ctx.startedAt,
    code: error?.code || 'INTERNAL_ERROR',
    message: error?.message || String(error || 'unknown error')
  })
}

module.exports = { createRequestContext, requestSuccess, requestFailure, log, maskId }
