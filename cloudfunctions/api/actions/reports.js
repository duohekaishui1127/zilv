const { db, C } = require('../lib/db')
const { fail, parseDateOnly, now } = require('../lib/utils')
const { loadProgressReport, loadProgressReportRange, loadActivityCalendar, loadDayReview, fetchAll } = require('../services/progress')
const { ensureReleaseAnnouncement } = require('../services/release-announcements')
const { getMakeupCardStatus } = require('../services/makeup-checkins')
const { getCheckinReminderSettings } = require('./notifications')
const { reportRange, previousRange, reportPrompt, reportPeriods } = require('../domain/review-period')
const { comparison, highlightLines, posterQuote } = require('../domain/review-summary')
const { membershipOf } = require('../domain/membership')
const { requireEntitlement } = require('../domain/entitlements')
const { basicWeekReport } = require('../domain/review-details')
const { localDateOf } = require('../domain/execution-history')
const { todayForUser } = require('../domain/makeup-cards')
const { loadAchievements } = require('../services/achievements')

async function getProgressReport({ user, event, localDate }) {
  const days = Number(event.days || 30)
  if (![7,30,90].includes(days)) throw fail('INVALID_PARAMETER','趋势范围仅支持7、30或90天')
  if (days !== 7) requireEntitlement(user,'ADVANCED_TRENDS')
  const report = await loadProgressReport(user._id,localDate,days)
  return membershipOf(user).isPro ? report : basicWeekReport(report)
}

async function getActivityCalendar({ user, event, localDate }) {
  await ensureReleaseAnnouncement(user).catch(error => console.warn('[release-announcement]',error?.message || error))
  const month = String(event.month || localDate.slice(0,7))
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw fail('INVALID_PARAMETER','月份格式不合法')
  const [calendar,makeup,reminderSettings] = await Promise.all([
    loadActivityCalendar(user._id,month), getMakeupCardStatus(user), getCheckinReminderSettings({ user })
  ])
  return { ...calendar,makeup,reminderSettings,membership:membershipOf(user),reportPrompt:reportPrompt(user,localDate) }
}

async function getWeeklyReport({ user, localDate }) {
  const report = await loadProgressReport(user._id,localDate,7)
  return membershipOf(user).isPro ? report : basicWeekReport(report)
}

async function getReviewReport({ user, event, localDate }) {
  const period = ['WEEK','MONTH','QUARTER'].includes(String(event.period || '').toUpperCase()) ? String(event.period).toUpperCase() : 'MONTH'
  const offset = Number(event.offset || 0)
  if (!Number.isInteger(offset) || offset < 0 || offset > 519) throw fail('INVALID_PARAMETER','报告周期不合法')
  const currentDate = todayForUser(user)
  const membership = membershipOf(user)
  const range = reportRange(period,currentDate,offset)
  if (!membership.isPro && (period !== 'WEEK' || offset > 0)) {
    return { locked:true,period:range,membership,identityCode:user.identityCode }
  }
  const periods = reportPeriods(period,currentDate,localDateOf(user.createdAt || user.betaStartedAt))
  if (offset >= periods.length) throw fail('INVALID_PARAMETER','没有更早的报告记录')
  const plans = await fetchAll(C.PLANS,{ userId:user._id })
  const current = await loadProgressReportRange(user._id,range.startDate,range.endDate,plans)
  const common = { locked:false,basic:!membership.isPro,period:range,membership,identityCode:user.identityCode,nickname:user.nickname,offset,periods:membership.isPro ? periods : [periods[0]] }
  if (!membership.isPro) {
    return { ...common,current:basicWeekReport(current),highlights:[`上周完成 ${current.summary.completedTasks} 次任务，留下 ${current.summary.reviewDays} 天打卡记录。`],completedGoals:[],unlockedBadges:[] }
  }
  const previousPeriod = previousRange(range)
  const [previous,achievements] = await Promise.all([
    loadProgressReportRange(user._id,previousPeriod.startDate,previousPeriod.endDate,plans),
    loadAchievements(user,currentDate)
  ])
  const completedGoals = current.details.timeline.map(item => ({ _id:item._id,name:item.name,completedAt:item.date }))
  return {
    ...common,current,previous:{ startDate:previous.startDate,endDate:previous.endDate,days:previous.days,summary:previous.summary },
    previousPeriod,comparison:comparison(current,previous),completedGoals,
    unlockedBadges:achievements.badges.filter(item => item.unlocked && item.earnedAt >= range.startDate && item.earnedAt <= range.endDate),
    highlights:highlightLines(current,completedGoals.length),posterQuote:posterQuote(current)
  }
}

async function markReviewSeen({ user,event }) {
  const period = String(event.period || '').toUpperCase(), key = String(event.key || '').slice(0,80)
  if (!['WEEK','MONTH','QUARTER'].includes(period) || !key.startsWith(`${period}:`)) throw fail('INVALID_PARAMETER','报告标识不合法')
  const reportViewMarks = { ...(user.reportViewMarks || {}),[period]:key }
  await db.collection(C.USERS).doc(user._id).update({ data:{ reportViewMarks,updatedAt:now() } })
  return { reportViewMarks }
}

async function getDayReview({ user,event }) {
  const date = String(event.reviewDate || '')
  if (!parseDateOnly(date)) throw fail('INVALID_PARAMETER','日期格式不合法')
  return { ...(await loadDayReview(user._id,date)),reminderSettings:await getCheckinReminderSettings({ user }) }
}

module.exports = { getProgressReport,getActivityCalendar,getWeeklyReport,getReviewReport,markReviewSeen,getDayReview }
