const { db,_,C } = require('../lib/db')
const { weekRange,fail } = require('../lib/utils')
const { isBasePlanDue } = require('../domain/plan-schedule')
const { isExecutionPlan } = require('../domain/plan-definition')

async function rows(collection,where) {
  const output = []
  for (let offset = 0; ; offset += 100) {
    const result = await db.collection(collection).where(where).orderBy('_id','asc').skip(offset).limit(100).get()
    output.push(...result.data)
    if (result.data.length < 100) return output
  }
}
async function getTodayPlans(userId,dateStr,suppliedPlans) {
  const [allPlans,todayCheckins] = await Promise.all([
    suppliedPlans || rows(C.PLANS,{ userId,enabled:true }),rows(C.CHECKINS,{ userId,date:dateStr })
  ])
  const todayCheckMap = new Map()
  todayCheckins.forEach(checkin => {
    const previous = todayCheckMap.get(checkin.planId)
    if (!previous || checkin.completed && !previous.completed) todayCheckMap.set(checkin.planId,checkin)
  })
  const basePlans = allPlans.filter(plan => !plan.deletedAt && plan.enabled !== false && isExecutionPlan(plan) && isBasePlanDue(plan,dateStr))
  if (!basePlans.length) return []
  let weeklyCounts = {}
  if (basePlans.some(plan => plan.repeatType === 'WEEKLY_COUNT')) {
    const { startDate } = weekRange(dateStr)
    const checkins = await rows(C.CHECKINS,{ userId,date:_.gte(startDate).and(_.lte(dateStr)),completed:true })
    const keys = new Set()
    checkins.forEach(item => {
      const key = `${item.planId}:${item.date}`
      if (keys.has(key)) return
      keys.add(key); weeklyCounts[item.planId] = (weeklyCounts[item.planId] || 0) + 1
    })
  }
  return basePlans.map(plan => {
    const checkin = todayCheckMap.get(plan._id) || null
    // Historical versions are needed in reports, not in every rendered task.
    const { scheduleHistory,linkedPlanHistory,...visible } = plan
    if (plan.repeatType !== 'WEEKLY_COUNT') return { ...visible,checkin,completed:Boolean(checkin?.completed) }
    const completed = weeklyCounts[plan._id] || 0
    const target = Math.max(1,Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1))
    if (!checkin && completed >= target) return null
    return { ...visible,checkin,completed:Boolean(checkin?.completed),weeklyProgress:{ completed,target } }
  }).filter(Boolean).sort((a,b) => (a.executionTime || '').localeCompare(b.executionTime || ''))
}
async function assertNoActiveTimer(userId,planId,dateStr) {
  const result = await db.collection(C.CHECKINS).where({ userId,planId,timerStatus:_.in(['RUNNING','PAUSED']) }).limit(1).get()
  if (result.data.length) throw fail('TIMER_ACTIVE','请先在“今日”页结束该计划的计时')
}

module.exports = { isBasePlanDue,getTodayPlans,assertNoActiveTimer }
