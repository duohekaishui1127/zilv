function pad(value) { return String(value).padStart(2, '0') }

function localParts(at = new Date(), timezoneOffsetMinutes = 480) {
  const offset = Math.max(-720, Math.min(840, Number(timezoneOffsetMinutes) || 0))
  const local = new Date(at.getTime() + offset * 60000)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth() + 1
  const day = local.getUTCDate()
  const hour = local.getUTCHours()
  const minute = local.getUTCMinutes()
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    minutes: hour * 60 + minute,
    weekday: local.getUTCDay() || 7
  }
}

function reminderMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function normalizeReminderSubscriptionType(value) {
  return String(value || '').trim().toUpperCase() === 'LONG_TERM' ? 'LONG_TERM' : 'ONE_TIME'
}

function isPlanDue(plan, local) {
  if (plan.startDate && local.date < plan.startDate) return false
  if (plan.endDate && local.date > plan.endDate) return false
  switch (plan.repeatType) {
    case 'WEEKDAYS': return local.weekday <= 5
    case 'WEEKENDS': return local.weekday >= 6
    case 'SPECIFIC_WEEKDAYS': return Array.isArray(plan.repeatConfig?.weekdays) && plan.repeatConfig.weekdays.includes(local.weekday)
    case 'DAILY':
    case 'WEEKLY_COUNT':
    default: return true
  }
}

function reminderContext(plan, at = new Date(), graceMinutes = 9) {
  if (!plan?.enabled || plan.deletedAt || !plan.reminderEnabled) return null
  const target = reminderMinutes(plan.reminderTime)
  if (target == null) return null
  const local = localParts(at, plan.reminderTimezoneOffset ?? 480)
  const delay = local.minutes - target
  if (delay < 0 || delay > graceMinutes || !isPlanDue(plan, local)) return null
  return local
}

function weekRange(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() - weekday + 1)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const format = value => `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  return { startDate: format(start), endDate: format(end) }
}

module.exports = { localParts, reminderMinutes, normalizeReminderSubscriptionType, isPlanDue, reminderContext, weekRange }
