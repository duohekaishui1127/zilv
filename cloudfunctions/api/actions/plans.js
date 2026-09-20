const { db, _, C } = require('../lib/db')
const { now, fail, weekRange } = require('../lib/utils')
const { isBasePlanDue, assertNoActiveTimer } = require('../services/plans')
const { emitGroupEventsForCheckin } = require('../services/social')
const { syncPlanCategoryRecord } = require('../services/plan-records')
const { ensureDailyReviewAfterCompletion } = require('../services/daily-reviews')
const { completedTimerFields } = require('../domain/plan-timer')
const { normalizePlan } = require('../domain/plan-definition')
const { requestGroupPlanChange } = require('../services/group-plan-changes')
async function createPlan({ user, event, localDate }) {
  const data = { userId: user._id, ...normalizePlan(event.plan, localDate), enabled: true, createdAt: now(), updatedAt: now() }
  const add = await db.collection(C.PLANS).add({ data })
  return { plan: { _id: add._id, ...data } }
}
async function getPlan({ user, event }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  return { plan }
}
async function updatePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const normalized = normalizePlan(event.plan, localDate, plan)
  const request = await requestGroupPlanChange({ userId:user._id,plan,type:'UPDATE',payload:{ plan:normalized } })
  if (request) return { approvalRequired:true,request }
  const data = { ...normalized, updatedAt: now() }
  await db.collection(C.PLANS).doc(plan._id).update({ data })
  return { plan: { ...plan, ...data } }
}
async function setPlanEnabled({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const enabled = !!event.enabled
  if (enabled !== Boolean(plan.enabled)) {
    const request = await requestGroupPlanChange({ userId:user._id,plan,type:'SET_ENABLED',payload:{ enabled } })
    if (request) return { approvalRequired:true,request }
  }
  if (!enabled) await assertNoActiveTimer(user._id, plan._id, localDate)
  await db.collection(C.PLANS).doc(plan._id).update({ data: { enabled, updatedAt: now() } })
  return { enabled }
}
async function deletePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const request = await requestGroupPlanChange({ userId:user._id,plan,type:'DELETE' })
  if (request) return { approvalRequired:true,request }
  await assertNoActiveTimer(user._id, plan._id, localDate)
  await db.collection(C.PLANS).doc(plan._id).update({ data: { enabled: false, deletedAt: now(), updatedAt: now() } })
  const bindings = await db.collection(C.PLAN_GROUPS).where({ planId: plan._id, userId: user._id, enabled: true }).get()
  await Promise.all(bindings.data.map(b => db.collection(C.PLAN_GROUPS).doc(b._id).update({ data: { enabled: false, updatedAt: now() } })))
  return { deleted: true }
}
async function getPlans({ user }) {
  const r = await db.collection(C.PLANS).where({ userId: user._id }).orderBy('createdAt', 'desc').get()
  return { plans: r.data.filter(p => !p.deletedAt) }
}
async function completePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!plan.enabled) throw fail('PLAN_DISABLED', '计划已停用')
  if (!isBasePlanDue(plan, localDate)) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')
  const cr = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  if (plan.repeatType === 'WEEKLY_COUNT' && !cr.data.length) {
    const { startDate, endDate } = weekRange(localDate)
    const count = await db.collection(C.CHECKINS).where({
      userId: user._id, planId: plan._id, date: _.gte(startDate).and(_.lte(endDate)), completed: true
    }).count()
    if (count.total >= Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)) throw fail('PLAN_WEEKLY_TARGET_REACHED', '本周目标已完成')
  }

  const existingCheckin = cr.data[0] || null
  const completionTime = now()
  const finalizedTimer = completedTimerFields(existingCheckin, plan, completionTime)
  const durationMinutes = event.durationMinutes === undefined
    ? (existingCheckin?.durationMinutes ?? null)
    : (event.durationMinutes === '' || event.durationMinutes == null ? null : Number(event.durationMinutes))
  if (durationMinutes != null && (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440)) {
    throw fail('INVALID_PARAMETER', '实际用时应为0到1440分钟')
  }
  const timerDurationMinutes = finalizedTimer.durationMinutes ?? (existingCheckin?.timerStatus === 'FINISHED'
    ? roundTimerMinutes(existingCheckin.timerEffectiveSeconds)
    : durationMinutes)
  const allowedMoods = ['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD']
  const mood = event.mood === undefined
    ? (existingCheckin?.mood || '')
    : (allowedMoods.includes(event.mood) ? event.mood : '')
  const note = event.note === undefined ? (existingCheckin?.note || '') : String(event.note || '').slice(0, 500)
  const actualValue = Number(event.actualValue ?? plan.targetValue ?? 1)
  if (!Number.isFinite(actualValue) || actualValue < 0 || actualValue > 1000000000) {
    throw fail('INVALID_PARAMETER', '实际完成量不合法')
  }
  let checkin
  const shouldEmitGroupEvent = !existingCheckin?.completed
  const completionVersion = shouldEmitGroupEvent ? Number(existingCheckin?.completionVersion || 0) + 1 : Number(existingCheckin?.completionVersion || 1)
  const data = {
    actualValue, completed: true,
    durationMinutes: timerDurationMinutes, mood, completedAt: shouldEmitGroupEvent ? completionTime : (existingCheckin?.completedAt || completionTime),
    completionVersion, revokedAt: null,
    note, ...finalizedTimer, updatedAt: completionTime
  }
  if (cr.data.length) {
    await db.collection(C.CHECKINS).doc(cr.data[0]._id).update({ data })
    checkin = { ...cr.data[0], ...data }
  } else {
    const base = { userId: user._id, planId: plan._id, date: localDate, createdAt: now(), ...data }
    const add = await db.collection(C.CHECKINS).add({ data: base })
    checkin = { _id: add._id, ...base }
  }
  await syncPlanCategoryRecord({ user, plan, checkin, localDate })
  if (shouldEmitGroupEvent) await emitGroupEventsForCheckin(user, plan, checkin).catch(error => {
    console.warn('[social-checkin]', error?.message || error)
  })
  const dailyReview = await ensureDailyReviewAfterCompletion(user._id, localDate).catch(error => {
    console.warn('[auto-daily-review]', error?.message || error)
    return null
  })
  return { checkin, dailyReview }
}
function roundTimerMinutes(seconds) { const value = Number(seconds); return Number.isFinite(value) && value >= 0 ? Math.round(value / 6) / 10 : null }
module.exports = { createPlan, getPlan, updatePlan, setPlanEnabled, deletePlan, getPlans, completePlan }
