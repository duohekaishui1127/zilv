const { membershipOf } = require('./membership')

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : date
}

function formatDate(date) { return date.toISOString().slice(0,10) }
function shiftDate(value, days) {
  const date = parseDate(value)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return formatDate(date)
}
function diffDays(from, to) {
  const a = parseDate(from), b = parseDate(to)
  return a && b ? Math.floor((b - a) / 86400000) : 0
}
function dateText(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 480 * 60000).toISOString().slice(0,10)
}
function mondayOf(value) {
  const date = parseDate(value)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1)
  return date
}
function previousWeekRange(localDate) {
  const monday = mondayOf(localDate)
  if (!monday) return null
  const endDate = shiftDate(formatDate(monday), -1)
  const startDate = shiftDate(endDate, -6)
  return { type:'WEEK', key:`WEEK:${startDate}`, label:'上周复盘', shortLabel:'周报', startDate, endDate, days:7 }
}
function previousMonthRange(localDate) {
  const current = parseDate(localDate)
  if (!current) return null
  const end = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const startDate = formatDate(start), endDate = formatDate(end)
  return { type:'MONTH', key:`MONTH:${startDate.slice(0,7)}`, label:`${start.getUTCFullYear()}年${start.getUTCMonth()+1}月复盘`, shortLabel:'月报', startDate, endDate, days:end.getUTCDate() }
}
function trailing90Range(localDate) {
  const endDate = shiftDate(localDate, -1), startDate = shiftDate(endDate, -89)
  return { type:'QUARTER', key:`QUARTER:${endDate}`, label:'我的90天', shortLabel:'90天', startDate, endDate, days:90 }
}
function reportRange(type, localDate, offset = 0) {
  if (type === 'WEEK') {
    const range = previousWeekRange(shiftDate(localDate, -7 * offset))
    if (offset) range.label = `${range.startDate.slice(5)}—${range.endDate.slice(5)} 周报`
    return range
  }
  if (type === 'MONTH') {
    const anchor = parseDate(localDate)
    if (!anchor) return null
    return previousMonthRange(formatDate(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1))))
  }
  return trailing90Range(shiftDate(localDate, -90 * offset))
}
function previousRange(range) {
  if (!range) return null
  if (range.type === 'MONTH') return previousMonthRange(range.startDate)
  if (range.type === 'WEEK') return previousWeekRange(range.startDate)
  const endDate = shiftDate(range.startDate, -1), startDate = shiftDate(endDate, -(range.days - 1))
  return { ...range, key:`${range.type}:PREVIOUS:${startDate}`, startDate, endDate }
}
function reportPeriods(type, localDate, joinedDate) {
  const items = []
  const limit = type === 'WEEK' ? 520 : type === 'MONTH' ? 120 : 40
  for (let offset = 0; offset < limit; offset++) {
    const range = reportRange(type, localDate, offset)
    if (offset > 0 && (!joinedDate || range.endDate < joinedDate)) break
    items.push({ offset, label:type === 'MONTH' ? range.label : `${range.startDate} ～ ${range.endDate}`, key:range.key })
  }
  return items
}
function reportPrompt(user = {}, localDate) {
  const marks = user.reportViewMarks || {}
  const date = parseDate(localDate)
  const day = Number(String(localDate).slice(-2)), weekday = date ? (date.getUTCDay() || 7) : 7
  const pro = membershipOf(user).isPro
  const month = previousMonthRange(localDate)
  if (pro && day <= 7 && month && marks.MONTH !== month.key) return month
  const week = previousWeekRange(localDate)
  if (weekday <= 2 && week && marks.WEEK !== week.key) return week
  const cycle = Math.floor(diffDays(dateText(user.betaStartedAt || user.createdAt), localDate) / 90)
  const quarterMark = cycle > 0 ? `QUARTER:${cycle}` : ''
  if (pro && cycle > 0 && marks.QUARTER !== quarterMark) return { ...trailing90Range(localDate), key:quarterMark }
  return null
}

module.exports = { parseDate, formatDate, shiftDate, diffDays, previousWeekRange, previousMonthRange, trailing90Range, reportRange, previousRange, reportPrompt, reportPeriods }
