const { localDateOf, scheduleAt } = require('./execution-history')
const { shiftDate } = require('./review-period')

const CATEGORIES = { STUDY:'学习', WORKOUT:'健身', DIET:'饮食', SLEEP:'睡眠', SKINCARE:'护肤', HEALTH:'健康', CUSTOM:'自定义' }
const TYPES = { DEADLINE:'考试计划', HABIT:'习惯养成', ACCUMULATION:'数量积累' }
const MOODS = { GREAT:'很棒', GOOD:'不错', OKAY:'一般', TIRED:'疲惫', BAD:'低落' }

function goalWasLinked(checkin, goal, plans) {
  if (Array.isArray(checkin.longTermGoalIdsSnapshot)) return checkin.longTermGoalIdsSnapshot.includes(goal._id)
  const plan = plans.find(item => item._id === checkin.planId)
  if (!plan) return false
  const version = scheduleAt(plan, checkin.date)
  if (version.known) return Boolean(version.plan?.longTermGoalIds?.includes(goal._id))
  // Older bindings did not record unbind dates. Do not invent contributions.
  return plan.managedByGoalId === goal._id
}

function buildReviewDetails(report, plans = [], checkins = []) {
  const { startDate, endDate, summary, daily } = report
  const tasks = report.tasks || []
  const categories = Object.entries(CATEGORIES).map(([key, label]) => {
    const items = tasks.filter(item => item.category === key && item.expected !== null)
    const expected = items.reduce((sum, item) => sum + item.expected, 0)
    const completed = items.reduce((sum, item) => sum + Math.min(item.expected,item.completed), 0)
    return { key, label, expected, completed, rate: expected ? Math.round(completed / expected * 100) : null }
  }).filter(item => item.expected > 0)
  const comparable = tasks.filter(item => item.expected >= 2 && item.rate != null)
  const stable = [...comparable].filter(item => item.completed > 0).sort((a,b) => b.rate - a.rate || b.completed - a.completed)[0] || null
  const needsAttention = [...comparable].filter(item => item.completed < item.expected).sort((a,b) => a.rate - b.rate || b.expected - a.expected)[0] || null
  const goals = plans.filter(item => item.planType === 'LONG_TERM' && !item.deletedAt)
  const contributions = goals.map(goal => {
    const end = goal.goalType === 'DEADLINE' ? goal.deadlineDate : localDateOf(goal.completedAt)
    const items = checkins.filter(item => item.completed && item.date >= (goal.startDate || startDate) && (!end || item.date <= end) && goalWasLinked(item, goal, plans))
    if (!items.length) return null
    return {
      _id:goal._id, name:goal.name, goalType:goal.goalType, typeLabel:TYPES[goal.goalType],
      completedCount:items.length, unit:goal.unit || '',
      incrementValue:goal.goalType === 'ACCUMULATION' ? Math.round(items.reduce((sum,item) => sum + Number(item.actualValue || 0),0) * 100) / 100 : null,
      durationMinutes:Math.round(items.reduce((sum,item) => sum + (item.durationMinutes == null ? Number(item.timerEffectiveSeconds || 0) / 60 : Number(item.durationMinutes)),0))
    }
  }).filter(Boolean)
  const timeline = goals.filter(goal => goal.goalStatus === 'COMPLETED').map(goal => ({
    _id:goal._id, name:goal.name, date:goal.goalType === 'DEADLINE' ? goal.deadlineDate : localDateOf(goal.completedAt),
    label:goal.goalType === 'DEADLINE' ? '考试已归档' : goal.completionMode === 'TERMINATED' ? '积累历程已归档' : goal.goalType === 'HABIT' ? '习惯已养成' : '目标已达成'
  })).filter(item => item.date >= startDate && item.date <= endDate).sort((a,b) => a.date.localeCompare(b.date))
  const moods = Object.entries(MOODS).map(([key,label]) => ({ key,label,count:daily.filter(item => item.mood === key).length })).filter(item => item.count)
  const weekMap = new Map()
  daily.forEach(day => {
    const key = shiftDate(day.date,1 - (new Date(`${day.date}T12:00:00Z`).getUTCDay() || 7))
    const week = weekMap.get(key) || { key,startDate:day.date,endDate:day.date,completedTasks:0,focusMinutes:0 }
    week.endDate = day.date
    week.completedTasks += day.checkinCount
    week.focusMinutes += day.focusMinutes
    weekMap.set(key,week)
  })
  const weeks = [...weekMap.values()]
  const coverage = `${summary.knownScheduleDays}/${report.days}`
  const suggestion = needsAttention
    ? `「${needsAttention.name}」本期完成 ${needsAttention.completed}/${needsAttention.expected} 次。下个周期可以先检查执行频率是否适合自己。`
    : stable ? `「${stable.name}」本期最稳定。下个周期先保持这个节奏，再考虑增加任务。`
      : '记录还不够充分，下个周期照常执行即可，不需要额外填写数据。'
  return { categories, stable, needsAttention, contributions, timeline, moods, suggestion, coverage, weeks }
}

function basicWeekReport(report) {
  const s = report.summary
  // A deliberately small payload: no daily series, health details, task rankings,
  // goal details or comparison data leak through the free overview.
  return {
    startDate:report.startDate, endDate:report.endDate, days:report.days,
    summary:{ activeDays:s.activeDays, completedTasks:s.completedTasks, focusMinutes:s.focusMinutes, reviewDays:s.reviewDays, longestStreak:s.longestStreak }
  }
}

module.exports = { buildReviewDetails, basicWeekReport, goalWasLinked }
