function pad(value) { return String(value).padStart(2, '0') }

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function shiftDate(value, days) {
  const date = parseDate(value)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return formatDate(date)
}

function diffDays(fromValue, toValue) {
  const from = parseDate(fromValue)
  const to = parseDate(toValue)
  if (!from || !to) return 0
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

function dateText(value) {
  if (!value) return ''
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  if (direct) return direct[0]
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function mondayOf(value) {
  const date = parseDate(value)
  if (!date) return null
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date
}

function previousWeekRange(localDate) {
  const monday = mondayOf(localDate)
  if (!monday) return null
  const end = new Date(monday)
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  const endDate = formatDate(end)
  const startDate = formatDate(start)
  return { type: 'WEEK', key: `WEEK:${startDate}`, label: '上周复盘', shortLabel: '周报', startDate, endDate, days: 7 }
}

function previousMonthRange(localDate) {
  const current = parseDate(localDate)
  if (!current) return null
  const end = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const startDate = formatDate(start)
  const endDate = formatDate(end)
  return { type: 'MONTH', key: `MONTH:${startDate.slice(0, 7)}`, label: `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月复盘`, shortLabel: '月报', startDate, endDate, days: end.getUTCDate() }
}

function trailing90Range(localDate) {
  const endDate = shiftDate(localDate, -1)
  const startDate = shiftDate(endDate, -89)
  return { type: 'QUARTER', key: `QUARTER:${endDate}`, label: '我的90天', shortLabel: '90天', startDate, endDate, days: 90 }
}

function reportRange(type, localDate) {
  if (type === 'WEEK') return previousWeekRange(localDate)
  if (type === 'MONTH') return previousMonthRange(localDate)
  return trailing90Range(localDate)
}

function previousRange(range) {
  if (!range) return null
  const endDate = shiftDate(range.startDate, -1)
  const startDate = shiftDate(endDate, -(range.days - 1))
  return { ...range, key: `${range.type}:PREVIOUS:${startDate}`, startDate, endDate }
}

function reportPrompt(user = {}, localDate) {
  const marks = user.reportViewMarks || {}
  const day = Number(String(localDate).slice(-2))
  const current = parseDate(localDate)
  const weekday = current ? (current.getUTCDay() || 7) : 7
  const month = previousMonthRange(localDate)
  if (day <= 7 && month && marks.MONTH !== month.key) return month
  const week = previousWeekRange(localDate)
  if (weekday <= 2 && week && marks.WEEK !== week.key) return week
  const joined = dateText(user.betaStartedAt || user.createdAt)
  const tenure = joined ? diffDays(joined, localDate) : 0
  const quarter = trailing90Range(localDate)
  const cycle = Math.floor(tenure / 90)
  const quarterMark = cycle > 0 ? `QUARTER:${cycle}` : ''
  if (cycle > 0 && marks.QUARTER !== quarterMark) return { ...quarter, key: quarterMark }
  return null
}

module.exports = {
  parseDate, formatDate, shiftDate, diffDays,
  previousWeekRange, previousMonthRange, trailing90Range, reportRange, previousRange, reportPrompt
}
