const { parseDateOnly } = require('../lib/utils')

function isBasePlanDue(plan, dateStr) {
  const d = parseDateOnly(dateStr)
  if (!d) return false
  const day = d.getDay()
  const mondayBased = day === 0 ? 7 : day
  if (plan.startDate && dateStr < plan.startDate) return false
  if (plan.endDate && dateStr > plan.endDate) return false
  if (plan.planType === 'LONG_TERM') return false

  switch (plan.repeatType) {
    case 'ONE_TIME': return dateStr === plan.startDate
    case 'DAILY': return true
    case 'WEEKDAYS': return mondayBased <= 5
    case 'WEEKENDS': return mondayBased >= 6
    case 'SPECIFIC_WEEKDAYS':
      return Array.isArray(plan.repeatConfig?.weekdays) && plan.repeatConfig.weekdays.includes(mondayBased)
    case 'WEEKLY_COUNT':
      return true
    default:
      return true
  }
}

module.exports = { isBasePlanDue }
