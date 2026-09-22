const { isBasePlanDue } = require('./plan-schedule')
const { isExecutionPlan, isLongTermGoal } = require('./plan-definition')

function dateAt(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
}

function shiftDate(value, amount) {
  const date = dateAt(value)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  const start = dateAt(from)
  const end = dateAt(to)
  return start && end ? Math.round((end - start) / 86400000) : null
}

function linkedPlansOf(goal, plans) {
  return plans.filter(plan => isExecutionPlan(plan)
    && Array.isArray(plan.longTermGoalIds)
    && plan.longTermGoalIds.includes(goal._id))
}

function checkinMapOf(checkins) {
  return new Map(checkins.filter(item => item.completed).map(item => [`${item.planId}:${item.date}`, item]))
}

function recentExecution(linkedPlans, checkins, localDate, days = 7, goalStartDate = '') {
  let total = 0
  let completed = 0
  const recentStart = shiftDate(localDate, -(days - 1))
  const startDate = goalStartDate && goalStartDate > recentStart ? goalStartDate : recentStart
  const checkinMap = checkinMapOf(checkins)
  linkedPlans.filter(plan => plan.repeatType === 'WEEKLY_COUNT').forEach(plan => {
    const target = Math.max(1, Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1))
    const count = checkins.filter(item => item.planId === plan._id && item.date >= startDate && item.date <= localDate).length
    total += target
    completed += Math.min(target, count)
  })
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = shiftDate(localDate, -offset)
    if (date < startDate) continue
    linkedPlans.filter(plan => plan.repeatType !== 'WEEKLY_COUNT' && isBasePlanDue(plan, date)).forEach(plan => {
      total++
      if (checkinMap.has(`${plan._id}:${date}`)) completed++
    })
  }
  return { completed, total, pct: total ? Math.round(completed / total * 100) : 0 }
}

function todayProgress(linkedPlans, completedCheckins, checkinMap, localDate) {
  let total = 0
  let completed = 0
  linkedPlans.forEach(plan => {
    if (!isBasePlanDue(plan, localDate)) return
    if (plan.repeatType === 'WEEKLY_COUNT') {
      const date = dateAt(localDate)
      const weekday = date.getUTCDay() || 7
      const weekStart = shiftDate(localDate, -(weekday - 1))
      const target = Math.max(1, Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1))
      const weekCount = completedCheckins.filter(item => item.planId === plan._id && item.date >= weekStart && item.date <= localDate).length
      const checkedToday = checkinMap.has(`${plan._id}:${localDate}`)
      if (!checkedToday && weekCount >= target) return
      total++
      if (checkedToday) completed++
      return
    }
    total++
    if (checkinMap.has(`${plan._id}:${localDate}`)) completed++
  })
  return { completed, total }
}

function habitStreak(linkedPlans, checkinMap, localDate) {
  if (!linkedPlans.length) return 0
  let streak = 0
  let started = false
  for (let offset = 0; offset < 366; offset++) {
    const date = shiftDate(localDate, -offset)
    const due = linkedPlans.filter(plan => isBasePlanDue(plan, date))
    if (!due.length) continue
    const successful = due.every(plan => checkinMap.has(`${plan._id}:${date}`))
    if (offset === 0 && !successful) continue
    if (!successful) break
    started = true
    streak++
  }
  return started ? streak : 0
}

function decorateGoal(goal, plans, checkins, localDate) {
  const linkedPlans = linkedPlansOf(goal, plans)
  const activeLinkedPlans = linkedPlans.filter(plan => !plan.deletedAt && plan.enabled !== false)
  const linkedIds = new Set(linkedPlans.map(plan => plan._id))
  const completedCheckins = checkins.filter(item => item.completed && linkedIds.has(item.planId)
    && (!goal.startDate || item.date >= goal.startDate))
  const checkinMap = checkinMapOf(completedCheckins)
  const accumulationBaselineCount=goal.goalType === 'ACCUMULATION' ? Number(goal.accumulationBaselineCompletedCount || 0) : 0
  const accumulationBaselineDuration=goal.goalType === 'ACCUMULATION' ? Number(goal.accumulationBaselineDurationMinutes || 0) : 0
  const base = {
    ...goal,
    linkedPlanCount: activeLinkedPlans.length,
    linkedPlans: activeLinkedPlans.map(plan => ({ _id: plan._id, name: plan.name })),
    todayProgress: todayProgress(activeLinkedPlans, completedCheckins, checkinMap, localDate),
    totalCompletedCount: accumulationBaselineCount + completedCheckins.length,
    totalDurationMinutes: accumulationBaselineDuration
      + completedCheckins.reduce((sum,item) => sum + Number(item.durationMinutes || 0),0),
    recentProgress: recentExecution(activeLinkedPlans, completedCheckins, localDate, 7, goal.startDate)
  }
  if (goal.goalType === 'DEADLINE') {
    const remaining = daysBetween(localDate, goal.deadlineDate)
    return { ...base, daysRemaining:remaining == null ? null : Math.max(0,remaining),examDateReached:remaining != null && remaining <= 0 }
  }
  if (goal.goalType === 'HABIT') {
    const currentValue = habitStreak(activeLinkedPlans, checkinMap, localDate)
    const targetValue = Number(goal.habitDays || 21)
    return { ...base, currentValue, targetValue, progressPct: Math.min(100, Math.round(currentValue / targetValue * 100)) }
  }
  const currentValue = Number(goal.accumulationBaselineValue || 0)
    + completedCheckins.reduce((sum, item) => sum + Number(item.actualValue || 0), 0)
  const targetValue = goal.unlimited ? null : Number(goal.targetValue || 0)
  const managedPlan=activeLinkedPlans.find(plan => plan.managedByGoalId === goal._id)
  return {
    ...base, currentValue, targetValue,
    remainingValue:targetValue > 0 ? Math.max(0,targetValue - currentValue) : null,
    recommendedValue:managedPlan ? Number(managedPlan.targetValue || 0) : null,
    progressPct: targetValue > 0 ? Math.min(100, Math.round(currentValue / targetValue * 100)) : null
  }
}

function decorateGoals(goals, plans, checkins, localDate) {
  return goals.filter(isLongTermGoal).map(goal => decorateGoal(goal, plans, checkins, localDate))
}

function automaticallyAchieved(goal) {
  if (goal.goalStatus !== 'ACTIVE') return false
  if (goal.goalType === 'HABIT') return goal.currentValue >= goal.targetValue
  return goal.goalType === 'ACCUMULATION' && !goal.unlimited && goal.targetValue > 0 && goal.currentValue >= goal.targetValue
}

module.exports = {
  shiftDate, daysBetween, linkedPlansOf, recentExecution, habitStreak,
  decorateGoal, decorateGoals, automaticallyAchieved
}
