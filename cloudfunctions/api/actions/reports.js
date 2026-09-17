const { fail, parseDateOnly } = require('../lib/utils')
const { loadProgressReport, loadActivityCalendar, loadDayReview } = require('../services/progress')
const { ensureReleaseAnnouncement } = require('../services/release-announcements')

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
  return loadActivityCalendar(user._id, month)
}

async function getWeeklyReport({ user, localDate }) {
  return loadProgressReport(user._id, localDate, 7)
}

async function getDayReview({ user, event }) {
  const date = String(event.reviewDate || '')
  if (!parseDateOnly(date)) throw fail('INVALID_PARAMETER', '日期格式不合法')
  return loadDayReview(user._id, date)
}

module.exports = { getProgressReport, getActivityCalendar, getWeeklyReport, getDayReview }
