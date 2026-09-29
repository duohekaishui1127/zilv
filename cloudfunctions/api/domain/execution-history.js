const { isBasePlanDue } = require('./plan-schedule')
const { shiftDate } = require('./review-period')

function localDateOf(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 480 * 60000).toISOString().slice(0,10)
}
function executionSnapshot(plan) {
  return {
    name:plan.name || '已归档任务',category:plan.category || 'CUSTOM',
    repeatType:plan.repeatType || 'DAILY',repeatConfig:plan.repeatConfig || {},
    startDate:plan.startDate || '',endDate:plan.endDate || null,enabled:plan.enabled !== false && !plan.deletedAt,
    targetValue:Number(plan.targetValue || 1),unit:plan.unit || '',
    longTermGoalIds:Array.isArray(plan.longTermGoalIds) ? plan.longTermGoalIds : [],managedByGoalId:plan.managedByGoalId || ''
  }
}
function completionSnapshots(plan, existing) {
  if (existing?.completed) return {
    planSnapshot:existing.planSnapshot || null,
    longTermGoalIdsSnapshot:Array.isArray(existing.longTermGoalIdsSnapshot) ? existing.longTermGoalIdsSnapshot : null
  }
  return { planSnapshot:executionSnapshot(plan),longTermGoalIdsSnapshot:Array.isArray(plan.longTermGoalIds) ? plan.longTermGoalIds : [] }
}
function recordExecutionHistory(plan, changes, date) {
  const history = [...(plan.scheduleHistory || [])]
  if (!history.length && plan.createdAt) {
    const from = localDateOf(plan.updatedAt || plan.createdAt)
    if (from && from < date) history.push({ from,...executionSnapshot(plan) })
  }
  return [...history.filter(item => item.from !== date),{ from:date,...executionSnapshot({ ...plan,...changes }) }].sort((a,b) => a.from.localeCompare(b.from))
}
function scheduleAt(plan, date) {
  if (plan.planType === 'LONG_TERM') return { known:true,plan:null }
  const created = localDateOf(plan.createdAt)
  if (created && created > date) return { known:true,plan:null }
  let version = null
  for (const item of plan.scheduleHistory || []) {
    if (item.from <= date && (!version || item.from > version.from)) version = item
  }
  if (version) return { known:true,plan:{ _id:plan._id,...version } }
  if (plan.scheduleHistory?.length) return { known:false,plan:null }
  const from = localDateOf(plan.updatedAt || plan.createdAt)
  return from && from <= date ? { known:true,plan:{ _id:plan._id,...executionSnapshot(plan) } } : { known:false,plan:null }
}
function weekStart(date) {
  return shiftDate(date,1 - (new Date(`${date}T12:00:00Z`).getUTCDay() || 7))
}
function buildExecutionLedger(input) {
  const { dates,plans = [],checkins = [],dailyReviews = [] } = input
  const completed = [...new Map(checkins.filter(item => item.completed).map(item => [`${item.planId}:${item.date}`,item])).values()]
  const keys = new Set(completed.map(item => `${item.planId}:${item.date}`))
  const observations = new Map(completed.filter(item => item.planSnapshot).map(item => [`${item.planId}:${item.date}`,item.planSnapshot]))
  const versionsByKey = new Map()
  const versionAt = (plan,date) => {
    const key = `${plan._id}:${date}`
    if (!versionsByKey.has(key)) {
      const observation = observations.get(key)
      versionsByKey.set(key,observation ? { known:true,plan:{ _id:plan._id,...observation } } : scheduleAt(plan,date))
    }
    return versionsByKey.get(key)
  }
  const reviews = new Map(dailyReviews.filter(item => item.status !== 'REVOKED').map(item => [item.date,item]))
  const taskMap = new Map()
  let expected = 0, done = 0
  function addTask(plan, total, count, comparable = true) {
    const item = taskMap.get(plan._id) || { planId:plan._id,name:plan.name || '已归档任务',category:plan.category || 'CUSTOM',expected:0,completed:0,rateCompleted:0,comparable:true,weekly:plan.repeatType === 'WEEKLY_COUNT' }
    item.expected += total; item.completed += count
    if (comparable) item.rateCompleted += Math.min(total,count)
    else item.comparable = false
    taskMap.set(plan._id,item)
  }
  const daily = dates.map(date => {
    const versions = plans.map(plan => versionAt(plan,date))
    const known = Array.isArray(input.plans) && versions.every(item => item.known)
    const review = reviews.get(date), snapshot = Array.isArray(review?.taskSnapshot) ? review.taskSnapshot : null
    const due = known || !snapshot
      ? versions.map(item => item.plan).filter(plan => plan?.enabled && plan.repeatType !== 'WEEKLY_COUNT' && isBasePlanDue(plan,date))
      : snapshot.filter(plan => plan.repeatType !== 'WEEKLY_COUNT').map(plan => ({ ...plan,_id:plan.planId }))
    const count = due.filter(plan => keys.has(`${plan._id}:${date}`)).length
    due.forEach(plan => addTask(plan,1,keys.has(`${plan._id}:${date}`) ? 1 : 0))
    // A legacy daily count includes flexible tasks available that day. It must
    // not be added again alongside a separately verified weekly quota.
    const legacy = !known && !snapshot && Number.isFinite(review?.totalPlanCount) && !versions.some(item => item.plan?.repeatType === 'WEEKLY_COUNT')
    const total = legacy ? Number(review.totalPlanCount) : due.length
    const finished = legacy ? Number(review.completedPlanCount || 0) : count
    expected += total; done += Math.min(total,finished)
    return { date,known:known || Boolean(snapshot) || legacy,scheduleKnown:known || Boolean(snapshot),total,completed:Math.min(total,finished) }
  })
  const weeks = [...new Set(dates.map(weekStart))], dateSet = new Set(dates)
  plans.filter(plan => plan.planType !== 'LONG_TERM').forEach(plan => {
    weeks.forEach(start => {
      const weekDates = Array.from({ length:7 },(_,i) => shiftDate(start,i))
      const versions = weekDates.map(date => versionAt(plan,date))
      const weekly = versions.find(item => item.plan?.repeatType === 'WEEKLY_COUNT')?.plan
      if (!weekly) return
      const count = completed.filter(item => item.planId === plan._id && weekDates.includes(item.date) && dateSet.has(item.date) && versionAt(plan,item.date).plan?.repeatType === 'WEEKLY_COUNT').length
      const full = weekDates.every(date => dateSet.has(date)) && versions.every((item,i) => item.known && item.plan?.enabled && item.plan.repeatType === 'WEEKLY_COUNT' && isBasePlanDue(item.plan,weekDates[i]) && JSON.stringify(item.plan.repeatConfig) === JSON.stringify(weekly.repeatConfig))
      const target = full ? Math.max(1,Number(weekly.repeatConfig?.weeklyCount || weekly.targetValue || 1)) : 0
      if (!full && !count) return
      addTask({ ...weekly,_id:plan._id },target,count,full)
      expected += target; done += Math.min(target,count)
    })
  })
  const tasks = [...taskMap.values()].map(item => ({ ...item,expected:item.comparable ? item.expected : null,rate:item.comparable && item.expected ? Math.round(item.rateCompleted / item.expected * 100) : null }))
  return { daily,expected,completed:done,tasks }
}

module.exports = { localDateOf,executionSnapshot,completionSnapshots,recordExecutionHistory,scheduleAt,buildExecutionLedger }
