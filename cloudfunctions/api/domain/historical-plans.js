const { scheduleAt } = require('./execution-history')
const { isBasePlanDue } = require('./plan-schedule')

function historicalPlans(plans, checkins, review, date, weeklyCheckins = checkins) {
  const source = new Map(plans.map(plan => [plan._id,plan]))
  const versions = new Map()
  let unknown = 0
  if (Array.isArray(review?.taskSnapshot)) {
    review.taskSnapshot.forEach(item => versions.set(item.planId,{ _id:item.planId,...item }))
  } else {
    plans.filter(plan => plan.planType !== 'LONG_TERM').forEach(plan => {
      const version = scheduleAt(plan,date)
      if (!version.known) unknown++
      if (version.plan?.enabled && isBasePlanDue(version.plan,date)) versions.set(plan._id,version.plan)
    })
  }
  const checkinMap = new Map()
  checkins.filter(item => item.date === date).forEach(item => {
    const previous = checkinMap.get(item.planId)
    if (!previous || item.completed && !previous.completed || item._id === previous._id) checkinMap.set(item.planId,item)
    if (item.planSnapshot) versions.set(item.planId,{ _id:item.planId,...item.planSnapshot })
    else if (item.completed && !versions.has(item.planId)) {
      const current = source.get(item.planId)
      versions.set(item.planId,{ _id:item.planId,name:current?.name || '已归档任务',category:current?.category || 'CUSTOM',historyUnavailable:true })
    }
  })
  const tasks = [...versions.values()].map(version => {
    const original = source.get(version._id) || {}
    const checkin = checkinMap.get(version._id) || null
    const plan = { ...version,userId:original.userId,planType:'EXECUTION',checkin,completed:Boolean(checkin?.completed) }
    if (plan.repeatType === 'WEEKLY_COUNT') {
      const keys = new Set(weeklyCheckins.filter(item => item.completed && item.planId === plan._id && item.date <= date).map(item => item.date))
      const target = Math.max(1,Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1))
      plan.weeklyProgress = { completed:keys.size,target }
      if (!Array.isArray(review?.taskSnapshot) && !checkin && keys.size >= target) return null
    }
    return plan
  }).filter(Boolean)
  return { tasks,historyUnavailable:unknown > 0 || tasks.some(plan => plan.historyUnavailable) }
}

module.exports = { historicalPlans }
