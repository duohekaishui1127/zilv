const FREE_FEATURES = Object.freeze([
  'CORE_TASKS','TODAY_EXECUTION','BASIC_TIMER','BASIC_CHECKIN','BASIC_CALENDAR',
  'LONG_TERM_GOALS','BASIC_BADGES','FRIENDS_GROUPS','BASIC_HEALTH_RECORDS','DATA_CONTROL'
])
const PRO_FEATURES = Object.freeze([
  'REVIEW_WEEK','REVIEW_MONTH','REVIEW_90D','REVIEW_POSTER','ADVANCED_TRENDS',
  'FULL_BADGE_ARCHIVE','PRO_RECOVERY','PRO_THEMES'
])

function entitlementsOf(membership = {}) {
  const pro = Boolean(membership.isPro)
  return {
    free: [...FREE_FEATURES],
    pro: [...PRO_FEATURES],
    enabled: [...FREE_FEATURES, ...(pro ? PRO_FEATURES : [])],
    reviewWeek: pro,
    reviewMonth: pro,
    review90d: pro,
    reviewPoster: pro,
    advancedTrends: pro,
    fullBadgeArchive: pro,
    proRecovery: pro,
    proThemes: pro
  }
}

module.exports = { FREE_FEATURES, PRO_FEATURES, entitlementsOf }
