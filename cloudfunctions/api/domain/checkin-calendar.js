const { dateOnly } = require('../lib/utils')
const { isBasePlanDue } = require('./plan-schedule')

function normalizedMonth(value) {
  const month = String(value || '')
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : dateOnly().slice(0, 7)
}

function monthDates(month) {
  const [year, value] = month.split('-').map(Number)
  const count = new Date(year, value, 0).getDate()
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}

function dayView(date, plans, checkinMap) {
  const tasks = []
  plans.forEach(plan => {
    const checkin = checkinMap.get(`${plan._id}:${date}`)
    const flexible = plan.repeatType === 'WEEKLY_COUNT'
    if (flexible && !checkin?.completed) return
    if (!flexible && (!plan.enabled || !isBasePlanDue(plan, date))) return
    tasks.push({
      planId: plan._id,
      name: plan.name || '计划',
      category: plan.category || 'CUSTOM',
      completed: Boolean(checkin?.completed)
    })
  })
  const completed = tasks.filter(item => item.completed).length
  const total = tasks.length
  return {
    date,
    day: Number(date.slice(-2)),
    completed,
    total,
    tasks,
    status: !total ? 'NONE' : (completed === total ? 'COMPLETE' : (completed ? 'PARTIAL' : 'PENDING'))
  }
}

function buildCheckinCalendar(monthValue, plans, checkins) {
  const month = normalizedMonth(monthValue)
  const dates = monthDates(month)
  const allowedIds = new Set(plans.map(plan => plan._id))
  const checkinMap = new Map(checkins.filter(item => allowedIds.has(item.planId))
    .map(item => [`${item.planId}:${item.date}`, item]))
  const days = dates.map(date => dayView(date, plans, checkinMap))
  return {
    month,
    days,
    summary: {
      completedDays: days.filter(day => day.status === 'COMPLETE').length,
      completedTasks: days.reduce((sum, day) => sum + day.completed, 0),
      totalTasks: days.reduce((sum, day) => sum + day.total, 0)
    }
  }
}

module.exports = { normalizedMonth, monthDates, buildCheckinCalendar }
