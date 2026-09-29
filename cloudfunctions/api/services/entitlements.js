const { membershipOf } = require('../domain/membership')
const { requireEntitlement, hasEntitlement } = require('../domain/entitlements')

function reminderEntitlement(user) {
  const membership = membershipOf(user)
  return { wechatAllowed: hasEntitlement(user, 'CHECKIN_WECHAT'), membership }
}

module.exports = { reminderEntitlement, requireEntitlement, hasEntitlement }
