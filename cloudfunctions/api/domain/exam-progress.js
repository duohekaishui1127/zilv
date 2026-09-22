const { isBasePlanDue } = require('./plan-schedule')

const EXAM_RESULT_STATUSES = Object.freeze(['PENDING', 'PASSED', 'FAILED', 'ABSENT'])

function dateAt(value) {
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? new Date(Date.UTC(Number(match[1]),Number(match[2]) - 1,Number(match[3]))) : null
}

function dateOnly(date) { return date.toISOString().slice(0,10) }

function dateRange(startDate,endDate) {
  const start=dateAt(startDate)
  const end=dateAt(endDate)
  if(!start || !end || start > end)return []
  const dates=[]
  for(let current=new Date(start);current <= end && dates.length < 10000;current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(dateOnly(current))
  }
  return dates
}

function weekStartOf(value) {
  const date=dateAt(value)
  if(!date)return ''
  const weekday=date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return dateOnly(date)
}

function preparationDays(startDate,endDate) {
  const start=dateAt(startDate)
  const end=dateAt(endDate)
  return start && end && start <= end ? Math.floor((end - start) / 86400000) + 1 : 0
}

function examArchiveDue(goal,localDate) {
  return Boolean(goal && goal.planType === 'LONG_TERM' && goal.goalType === 'DEADLINE'
    && goal.goalStatus === 'ACTIVE' && goal.enabled !== false && !goal.deletedAt
    && goal.deadlineDate && goal.deadlineDate <= localDate)
}

function linkedPlansOf(goal,plans) {
  const history=Array.isArray(goal.linkedPlanHistory) ? goal.linkedPlanHistory : []
  const historicalIds=new Set(history.map(item => item.planId))
  return (plans || []).filter(plan => plan.planType !== 'LONG_TERM'
    && ((Array.isArray(plan.longTermGoalIds) && plan.longTermGoalIds.includes(goal._id)) || historicalIds.has(plan._id)))
}

function checkinDurationMinutes(checkin,plan) {
  const duration=Number(checkin.durationMinutes)
  if(Number.isFinite(duration) && duration >= 0)return duration
  const seconds=Number(checkin.timerEffectiveSeconds)
  if(Number.isFinite(seconds) && seconds >= 0)return seconds / 60
  const actual=Number(checkin.actualValue)
  return plan?.targetType === 'DURATION' && Number.isFinite(actual) && actual >= 0 ? actual : 0
}

function examProgressSnapshot(goal,plans,checkins) {
  const startDate=goal.startDate || goal.deadlineDate
  const endDate=goal.deadlineDate
  const dates=dateRange(startDate,endDate)
  const linkedPlans=linkedPlansOf(goal,plans)
  const linkedIds=new Set(linkedPlans.map(plan => plan._id))
  const completed=(checkins || []).filter(item => item.completed && linkedIds.has(item.planId)
    && item.date >= startDate && item.date <= endDate)
  const checkinKeys=new Set(completed.map(item => `${item.planId}:${item.date}`))
  let scheduledCount=0
  let scheduledCompletedCount=0

  linkedPlans.forEach(plan => {
    if(plan.repeatType !== 'WEEKLY_COUNT') {
      dates.filter(date => isBasePlanDue(plan,date)).forEach(date => {
        scheduledCount++
        if(checkinKeys.has(`${plan._id}:${date}`))scheduledCompletedCount++
      })
      return
    }
    const weeks=new Map()
    dates.filter(date => isBasePlanDue(plan,date)).forEach(date => {
      const week=weekStartOf(date)
      weeks.set(week,(weeks.get(week) || 0) + 1)
    })
    weeks.forEach((availableDays,week) => {
      const target=Math.min(availableDays,Math.max(1,Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)))
      const count=completed.filter(item => item.planId === plan._id && weekStartOf(item.date) === week).length
      scheduledCount += target
      scheduledCompletedCount += Math.min(target,count)
    })
  })

  const planById=new Map(linkedPlans.map(plan => [plan._id,plan]))
  const durationMinutes=Math.round(completed.reduce((sum,item) => sum + checkinDurationMinutes(item,planById.get(item.planId)),0))
  return {
    createdDate:startDate,
    examDate:endDate,
    preparationDays:preparationDays(startDate,endDate),
    linkedPlans:linkedPlans.map(plan => ({ _id:plan._id,name:plan.name,category:plan.category || 'CUSTOM' })),
    linkedPlanCount:linkedPlans.length,
    completedCount:completed.length,
    durationMinutes,
    scheduledCount,
    scheduledCompletedCount,
    completionPct:scheduledCount ? Math.round(scheduledCompletedCount / scheduledCount * 100) : null
  }
}

module.exports={ EXAM_RESULT_STATUSES,preparationDays,examArchiveDue,examProgressSnapshot }
