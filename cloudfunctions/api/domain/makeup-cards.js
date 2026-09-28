const { membershipOf } = require('./membership')
const { DEFAULTS, productRules } = require('../config/product-rules')

// These exports remain as defaults for compatibility/tests. Runtime policy reads productRules().
const CARD_CAP = DEFAULTS.makeupFreeCap
const PRO_CARD_CAP = DEFAULTS.makeupProCap
const MONTHLY_GRANT = DEFAULTS.makeupFreeMonthlyGrant
const PRO_MONTHLY_GRANT = DEFAULTS.makeupProMonthlyGrant
const INITIAL_CARDS = 3
const INITIAL_GRANT_VERSION = 3

function dateAtOffset(at = new Date(), offsetMinutes = 480) {
  const offset = Number.isFinite(Number(offsetMinutes)) ? Number(offsetMinutes) : 480
  return new Date(new Date(at).getTime() + offset * 60000).toISOString().slice(0, 10)
}

function todayForUser(user = {}, at = new Date()) {
  const offset = Number(user.checkinReminderTimezoneOffset ?? 480)
  return dateAtOffset(at, offset >= -720 && offset <= 840 ? offset : 480)
}

function previousDate(date) {
  const at = new Date(`${date}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}

function monthIndex(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return null
  const [year, number] = month.split('-').map(Number)
  return year * 12 + number - 1
}

function makeupPolicy(user = {}, at = new Date()) {
  const membership = membershipOf(user, at)
  const rules = productRules().makeup
  return membership.isPro
    ? { tier:'PRO', cap:rules.pro.cap, monthlyGrant:rules.pro.monthlyGrant }
    : { tier:'FREE', cap:rules.free.cap, monthlyGrant:rules.free.monthlyGrant }
}

function makeupCardState(user = {}, today, at = new Date()) {
  const currentMonth = String(today).slice(0, 7)
  const recordedMonth = String(user.makeupCardGrantMonth || '')
  const recordedIndex = monthIndex(recordedMonth)
  const currentIndex = monthIndex(currentMonth)
  const policy = makeupPolicy(user, at)
  if (recordedIndex == null || currentIndex == null) {
    return { balance: Math.min(policy.cap, INITIAL_CARDS), grantMonth: currentMonth, policy }
  }
  const rawBalance = Number(user.makeupCardBalance || 0)
  const legacyTopUp = Number(user.makeupCardInitialGrantVersion || 0) < 2 ? INITIAL_CARDS - 1 : 0
  const monthsPassed = Math.max(0, currentIndex - recordedIndex)
  const balance = Math.min(policy.cap,
    Math.max(0, Number.isFinite(rawBalance) ? Math.floor(rawBalance) : 0)
      + monthsPassed * policy.monthlyGrant + legacyTopUp)
  return {
    balance,
    grantMonth: currentIndex > recordedIndex ? currentMonth : recordedMonth,
    policy
  }
}

module.exports = {
  CARD_CAP,PRO_CARD_CAP,MONTHLY_GRANT,PRO_MONTHLY_GRANT,INITIAL_CARDS,INITIAL_GRANT_VERSION,
  dateAtOffset,todayForUser,previousDate,makeupPolicy,makeupCardState
}
