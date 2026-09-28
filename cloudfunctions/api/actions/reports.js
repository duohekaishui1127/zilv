const { db, C } = require('../lib/db')
const { fail, parseDateOnly, now } = require('../lib/utils')
const { loadProgressReport, loadProgressReportRange, loadActivityCalendar, loadDayReview, fetchAll } = require('../services/progress')
const { ensureReleaseAnnouncement } = require('../services/release-announcements')
const { getMakeupCardStatus } = require('../services/makeup-checkins')
const { getCheckinReminderSettings } = require('./notifications')
const { reportRange, previousRange, reportPrompt } = require('../domain/review-period')
const { comparison, highlightLines, posterQuote } = require('../domain/review-summary')
const { membershipOf } = require('../domain/membership')
const { loadAchievements } = require('../services/achievements')

function completedDate(value) {
  if (!value) return ''
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  if (direct) return direct[0]
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

async function getProgressReport({ user, event, localDate }) {
  const days = Number(event.days || 30)
  if (![7, 30, 90].includes(days)) throw fail('INVALID_PARAMETER', '趋势范围仅支持7、30或90天')
  return loadProgressReport(user._id, localDate, days)
}

async function getActivityCalendar({ user, event, localDate }) {
  await ensureReleaseAnnouncement(user).catch(error => console.warn('[release-announcement]', error?.message || error))
  const currentMonth = localDate.slice(0, 7)
  const month = String(event.month || currentMonth)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw fail('INVALID_PARAMETER', '月份格式不合法')
  const [calendar, makeup, reminderSettings] = await Promise.all([
    loadActivityCalendar(user._id, month),
    getMakeupCardStatus(user),
    getCheckinReminderSettings({ user })
  ])
  return {
    ...calendar,
    makeup,
    reminderSettings,
    membership: membershipOf(user),
    reportPrompt: reportPrompt(user, localDate)
  }
}

async function getWeeklyReport({ user, localDate }) {
  return loadProgressReport(user._id, localDate, 7)
}

async function getReviewReport({ user, event, localDate }) {
  const period = ['WEEK', 'MONTH', 'QUARTER'].includes(String(event.period || '').toUpperCase())
    ? String(event.period).toUpperCase() : 'MONTH'
  const range = reportRange(period, localDate)
  const membership = membershipOf(user)
  if (!membership.isPro) return { locked: true, period: range, membership, identityCode: user.identityCode }
  const previous = previousRange(range)
  const [currentReport, previousReport, plans, achievements] = await Promise.all([
    loadProgressReportRange(user._id, range.startDate, range.endDate),
    loadProgressReportRange(user._id, previous.startDate, previous.endDate),
    fetchAll(C.PLANS, { userId: user._id }),
    loadAchievements(user, localDate)
  ])
  const completedGoals = plans.filter(plan => plan.planType === 'LONG_TERM' && plan.goalStatus === 'COMPLETED')
  const goalsInRange = completedGoals.filter(goal => {
    const date = completedDate(goal.completedAt)
    return date && date >= range.startDate && date <= range.endDate
  })
  const unlockedBadges = achievements.badges.filter(item => item.unlocked && item.earnedAt >= range.startDate && item.earnedAt <= range.endDate)
  return {
    locked: false,
    period: range,
    membership,
    identityCode: user.identityCode,
    nickname: user.nickname,
    current: currentReport,
    previous: previousReport,
    comparison: comparison(currentReport, previousReport),
    completedGoals: goalsInRange.map(goal => ({ _id: goal._id, name: goal.name, goalType: goal.goalType, completedAt: goal.completedAt })),
    unlockedBadges,
    highlights: highlightLines(currentReport, goalsInRange.length),
    posterQuote: posterQuote(currentReport)
  }
}

async function markReviewSeen({ user, event }) {
  const period = String(event.period || '').toUpperCase()
  const key = String(event.key || '').slice(0, 80)
  if (!['WEEK', 'MONTH', 'QUARTER'].includes(period) || !key.startsWith(`${period}:`)) throw fail('INVALID_PARAMETER', '报告标识不合法')
  const reportViewMarks = { ...(user.reportViewMarks || {}), [period]: key }
  await db.collection(C.USERS).doc(user._id).update({ data: { reportViewMarks, updatedAt: now() } })
  return { reportViewMarks }
}

async function getDayReview({ user, event }) {
  const date = String(event.reviewDate || '')
  if (!parseDateOnly(date)) throw fail('INVALID_PARAMETER', '日期格式不合法')
  const review = await loadDayReview(user._id, date)
  return { ...review, reminderSettings: await getCheckinReminderSettings({ user }) }
}

module.exports = { getProgressReport, getActivityCalendar, getWeeklyReport, getReviewReport, markReviewSeen, getDayReview }
