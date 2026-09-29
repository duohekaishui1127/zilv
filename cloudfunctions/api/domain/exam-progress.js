const { buildExecutionLedger,scheduleAt,localDateOf } = require('./execution-history')

const EXAM_RESULT_STATUSES = Object.freeze(['PENDING','PASSED','FAILED','ABSENT'])
function dateAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : date
}
function dateRange(startDate,endDate) {
  const start = dateAt(startDate), end = dateAt(endDate)
  if (!start || !end || start > end) return []
  const dates = []
  for (let current = new Date(start); current <= end && dates.length < 10000; current.setUTCDate(current.getUTCDate() + 1)) dates.push(current.toISOString().slice(0,10))
  return dates
}
function preparationDays(startDate,endDate) {
  const start = dateAt(startDate), end = dateAt(endDate)
  return start && end && start <= end ? Math.floor((end - start) / 86400000) + 1 : 0
}
function examArchiveDue(goal,localDate) {
  return Boolean(goal && goal.planType === 'LONG_TERM' && goal.goalType === 'DEADLINE' && goal.goalStatus === 'ACTIVE' && goal.enabled !== false && !goal.deletedAt && goal.deadlineDate && goal.deadlineDate <= localDate)
}
function linkedPlansOf(goal,plans,checkins) {
  const ids = new Set((goal.linkedPlanHistory || []).map(item => item.planId))
  checkins.filter(item => item.longTermGoalIdsSnapshot?.includes(goal._id)).forEach(item => ids.add(item.planId))
  return plans.filter(plan => plan.planType !== 'LONG_TERM' && (ids.has(plan._id) || plan.longTermGoalIds?.includes(goal._id) || plan.scheduleHistory?.some(item => item.longTermGoalIds?.includes(goal._id))))
}
function checkinDurationMinutes(checkin,plan) {
  if (checkin.durationMinutes != null && Number.isFinite(Number(checkin.durationMinutes))) return Math.max(0,Number(checkin.durationMinutes))
  if (checkin.timerEffectiveSeconds != null) return Math.max(0,Number(checkin.timerEffectiveSeconds) / 60)
  return plan?.targetType === 'DURATION' ? Math.max(0,Number(checkin.actualValue || 0)) : 0
}
function examProgressSnapshot(goal,plans,checkins) {
  const startDate = goal.startDate || localDateOf(goal.createdAt) || goal.deadlineDate, endDate = goal.deadlineDate
  const dates = dateRange(startDate,endDate)
  const linked = linkedPlansOf(goal,plans,checkins)
  const byId = new Map(linked.map(plan => [plan._id,plan]))
  const completed = [...new Map(checkins.filter(item => {
    if (!item.completed || !byId.has(item.planId) || item.date < startDate || item.date > endDate) return false
    if (Array.isArray(item.longTermGoalIdsSnapshot)) return item.longTermGoalIdsSnapshot.includes(goal._id)
    const version = scheduleAt(byId.get(item.planId),item.date)
    return version.known ? Boolean(version.plan?.longTermGoalIds?.includes(goal._id)) : true
  }).map(item => [`${item.planId}:${item.date}`,item])).values()]
  const scoped = linked.map(plan => ({
    ...plan,
    scheduleHistory:(plan.scheduleHistory || []).map(item => ({ ...item,enabled:item.enabled && item.longTermGoalIds?.includes(goal._id) })),
    enabled:plan.enabled !== false && plan.longTermGoalIds?.includes(goal._id)
  }))
  const ledger = buildExecutionLedger({ dates,plans:scoped,checkins:completed })
  const unknownScheduleDays = ledger.daily.filter(item => !item.scheduleKnown).length
  return {
    createdDate:startDate,examDate:endDate,preparationDays:preparationDays(startDate,endDate),
    linkedPlans:linked.map(plan => {
      const historical = completed.find(item => item.planId === plan._id)?.planSnapshot
      const version = scheduleAt(plan,endDate).plan
      return { _id:plan._id,name:historical?.name || version?.name || goal.linkedPlanHistory?.find(item => item.planId === plan._id)?.name || plan.name,category:historical?.category || version?.category || plan.category || 'CUSTOM' }
    }),
    linkedPlanCount:linked.length,completedCount:completed.length,
    durationMinutes:Math.round(completed.reduce((sum,item) => sum + checkinDurationMinutes(item,item.planSnapshot || byId.get(item.planId)),0)),
    scheduledCount:ledger.expected,scheduledCompletedCount:ledger.completed,unknownScheduleDays,
    completionPct:ledger.expected ? Math.round(ledger.completed / ledger.expected * 100) : null
  }
}
module.exports = { EXAM_RESULT_STATUSES,preparationDays,examArchiveDue,examProgressSnapshot }
