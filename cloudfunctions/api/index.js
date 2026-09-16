const { cloud } = require('./lib/db')
const { ok, fail, dateOnly, parseDateOnly } = require('./lib/utils')
const { ensureUser } = require('./services/users')
const { assertSystemReady } = require('./services/system')
const { createRequestContext, requestSuccess, requestFailure, maskId } = require('./lib/logger')
const { APP_VERSION, SCHEMA_VERSION } = require('./lib/version')
const { writeAudit } = require('./services/audit')
const actions = require('./actions')

exports.main = async (event = {}) => {
  const actionName = event.action || 'dashboard'
  let ctx = createRequestContext({ action: actionName })

  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return fail('UNAUTHORIZED', '无法识别微信用户', { requestId: ctx.requestId })

    await assertSystemReady()
    const user = await ensureUser(OPENID)
    ctx = { ...ctx, userId: maskId(user._id) }

    const handler = actions[actionName]
    if (!handler) return fail('NOT_FOUND', `未知 action: ${actionName}`, { requestId: ctx.requestId })

    const localDate = parseDateOnly(event.date) ? String(event.date) : dateOnly()
    const data = await handler({ user, event, localDate, requestId: ctx.requestId })
    await writeAudit({ userId: user._id, action: actionName, requestId: ctx.requestId, event, data })
    requestSuccess(ctx)
    return ok(data, { requestId: ctx.requestId, version: APP_VERSION, schemaVersion: SCHEMA_VERSION })
  } catch (err) {
    requestFailure(ctx, err)
    if (err && err.success === false && err.code) return { ...err, requestId: ctx.requestId }
    return fail('INTERNAL_ERROR', '服务器内部错误', { requestId: ctx.requestId })
  }
}
