const { membershipOf } = require('./membership')
const { fail } = require('../lib/utils')

const FREE_FEATURES = Object.freeze([
  'CORE_TASKS','TODAY_EXECUTION','BASIC_TIMER','BASIC_CHECKIN','BASIC_CALENDAR',
  'LONG_TERM_GOALS','BASIC_BADGES','FRIENDS_GROUPS','BASIC_HEALTH_RECORDS','DATA_CONTROL',
  'BASIC_WEEK_REVIEW','INTERNAL_NOTIFICATIONS'
])
const PRO_FEATURES = Object.freeze([
  'REVIEW_WEEK','REVIEW_MONTH','REVIEW_90D','REVIEW_POSTER','ADVANCED_TRENDS',
  'FULL_BADGE_ARCHIVE','PRO_RECOVERY','PRO_THEMES','CHECKIN_WECHAT','SPECIAL_CARE_WECHAT'
])

function hasEntitlement(user, feature, at) {
  return FREE_FEATURES.includes(feature) || (PRO_FEATURES.includes(feature) && membershipOf(user, at).isPro)
}

function requireEntitlement(user, feature, at) {
  if (!hasEntitlement(user, feature, at)) throw fail('PRO_REQUIRED', '此功能属于 Pro，基础记录和消息中心仍可使用')
}

function entitlementsOf(membership = {}) {
  const pro = Boolean(membership.isPro)
  return {
    free: [...FREE_FEATURES], pro: [...PRO_FEATURES],
    enabled: [...FREE_FEATURES, ...(pro ? PRO_FEATURES : [])],
    reviewWeek: pro, reviewMonth: pro, review90d: pro, reviewPoster: pro,
    advancedTrends: pro, fullBadgeArchive: pro, proRecovery: pro, proThemes: pro,
    checkinWechat: pro, specialCareWechat: pro
  }
}

module.exports = { FREE_FEATURES, PRO_FEATURES, entitlementsOf, hasEntitlement, requireEntitlement }
