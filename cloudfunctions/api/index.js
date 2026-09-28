const { cloud } = require('./lib/db')
const { ok, fail, dateOnly, parseDateOnly } = require('./lib/utils')
const { ensureUser, findUserByOpenid } = require('./services/users')
const { assertSystemReady } = require('./services/system')
const { createRequestContext, requestSuccess, requestFailure, maskId } = require('./lib/logger')
const { APP_VERSION, SCHEMA_VERSION } = require('./lib/version')
const { writeAudit } = require('./services/audit')
const { legalAccepted, legalConfig } = require('./domain/legal')
const actions = require('./actions')

const PUBLIC_ACTIONS = new Set(['getLegalGate'])
const CONSENT_ACTIONS = new Set(['acceptLegal'])
const NO_AUDIT_ACTIONS = new Set(['getLegalGate','deleteAccount'])

exports.main = async (event = {}) => {
  const actionName = event.action || 'dashboard'
  let ctx = createRequestContext({ action: actionName })

  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return fail('UNAUTHORIZED', '无法识别微信用户', { requestId: ctx.requestId })

    await assertSystemReady()
    const handler = actions[actionName]
    if (!handler) return fail('NOT_FOUND', `未知 action: ${actionName}`, { requestId: ctx.requestId })
    const localDate = parseDateOnly(event.date) ? String(event.date) : dateOnly()

    if (PUBLIC_ACTIONS.has(actionName)) {
      const user = await findUserByOpenid(OPENID)
      if (user) ctx = { ...ctx, userId: maskId(user._id) }
      const data = await handler({ user, event, localDate, requestId: ctx.requestId })
      requestSuccess(ctx)
      return ok(data, { requestId: ctx.requestId, version: APP_VERSION, schemaVersion: SCHEMA_VERSION })
    }

    let user
    if (CONSENT_ACTIONS.has(actionName)) {
      const config = legalConfig()
      if (event.accepted !== true) return fail('LEGAL_CONSENT_REQUIRED', '需要同意用户协议与隐私政策后继续使用', { requestId: ctx.requestId })
      if (String(event.termsVersion || '') !== config.termsVersion || String(event.privacyVersion || '') !== config.privacyVersion) {
        return fail('LEGAL_VERSION_MISMATCH', '协议版本已更新，请重新阅读后确认', { requestId: ctx.requestId })
      }
      user = await ensureUser(OPENID)
    } else {
      user = await findUserByOpenid(OPENID)
      if (!user || !legalAccepted(user)) {
        return fail('LEGAL_CONSENT_REQUIRED', '请先阅读并同意用户服务协议与隐私政策', { requestId: ctx.requestId })
      }
      user = await ensureUser(OPENID)
    }
    ctx = { ...ctx, userId: maskId(user._id) }

    const data = await handler({ user, event, localDate, requestId: ctx.requestId })
    if (!NO_AUDIT_ACTIONS.has(actionName)) await writeAudit({ userId: user._id, action: actionName, requestId: ctx.requestId, event, data })
    requestSuccess(ctx)
    return ok(data, { requestId: ctx.requestId, version: APP_VERSION, schemaVersion: SCHEMA_VERSION })
  } catch (err) {
    requestFailure(ctx, err)
    if (err && err.success === false && err.code) return { ...err, requestId: ctx.requestId }
    return fail('INTERNAL_ERROR', '服务器内部错误', { requestId: ctx.requestId })
  }
}
