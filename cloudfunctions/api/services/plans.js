const { db, _, C } = require('../lib/db')
const { weekRange, fail } = require('../lib/utils')
const { isBasePlanDue } = require('../domain/plan-schedule')

async function getTodayPlans(userId, dateStr) {
  const [planResult, todayCheckResult] = await Promise.all([
    db.collection(C.PLANS).where({ userId, enabled: true }).get(),
    db.collection(C.CHECKINS).where({ userId, date: dateStr }).get()
  ])
  const todayCheckMap = Object.fromEntries(todayCheckResult.data.map(c => [c.planId, c]))
  const basePlans = planResult.data.filter(p => isBasePlanDue(p, dateStr))
  if (!basePlans.length) return []

  const weeklyPlans = basePlans.filter(p => p.repeatType === 'WEEKLY_COUNT')
  let weeklyCounts = {}
  if (weeklyPlans.length) {
    const { startDate, endDate } = weekRange(dateStr)
    const r = await db.collection(C.CHECKINS).where({
      userId,
      date: _.gte(startDate).and(_.lte(endDate)),
      completed: true
    }).get()
    weeklyCounts = r.data.reduce((acc, c) => {
      acc[c.planId] = (acc[c.planId] || 0) + 1
      return acc
    }, {})
  }

  return basePlans
    .map(plan => {
      const checkin = todayCheckMap[plan._id] || null
      if (plan.repeatType !== 'WEEKLY_COUNT') {
        return { ...plan, checkin, completed: !!checkin?.completed }
      }
      const completedThisWeek = weeklyCounts[plan._id] || 0
      const weeklyTarget = Math.max(1, Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1))
      const due = !!checkin || completedThisWeek < weeklyTarget
      if (!due) return null
      return {
        ...plan,
        checkin,
        completed: !!checkin?.completed,
        weeklyProgress: { completed: completedThisWeek, target: weeklyTarget }
      }
    })
    .filter(Boolean)
}

async function assertNoActiveTimer(userId, planId, dateStr) {
  const result = await db.collection(C.CHECKINS).where({ userId, planId, date: dateStr }).limit(1).get()
  if (['RUNNING', 'PAUSED'].includes(result.data[0]?.timerStatus)) throw fail('TIMER_ACTIVE', '请先在“今日”页结束该计划的计时')
}

module.exports = { isBasePlanDue, getTodayPlans, assertNoActiveTimer }
