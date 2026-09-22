const { db, _, C } = require('../lib/db')
const { now, fail, weekRange } = require('../lib/utils')
const { isBasePlanDue } = require('../services/plans')
const { emitGroupEventsForCheckin } = require('../services/social')
const { syncPlanCategoryRecord } = require('../services/plan-records')
const { ensureDailyReviewAfterCompletion } = require('../services/daily-reviews')
const { completedTimerFields } = require('../domain/plan-timer')
const { normalizePlan, isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { longTermContext, syncLongTermGoalAchievements } = require('../services/long-term-goals')
const { requestGroupPlanChange, applyPlanChange } = require('../services/group-plan-changes')
const { broadcastGroupPlanChange } = require('../services/group-plan-broadcasts')
const { prepareManagedAccumulationPlanUpdate } = require('../services/managed-accumulation')
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
async function updatePlan({ user, event, localDate, requestId }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!isExecutionPlan(plan)) throw fail('INVALID_PARAMETER', '请使用长期目标编辑入口')
  let normalized = normalizePlan(event.plan, localDate, plan)
  if(plan.managedByGoalId)normalized=await prepareManagedAccumulationPlanUpdate(user._id,plan,normalized,localDate)
  const decision = await requestGroupPlanChange({ userId:user._id,plan,type:'UPDATE',payload:{ plan:normalized } })
  if (decision.approvalRequired) return { approvalRequired:true,request:decision.request }
  const result=await applyPlanChange(decision.change,localDate)
  await broadcastGroupPlanChange({ actor:user,change:decision.change,sourceId:requestId })
  return result
}
async function setPlanEnabled({ user, event, localDate, requestId }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!isExecutionPlan(plan)) throw fail('INVALID_PARAMETER', '长期目标不能作为执行任务启停')
  if(plan.managedByGoalId)throw fail('INVALID_PARAMETER','该任务由数量积累目标管理，不能单独启停')
  const enabled = !!event.enabled
  if (enabled === Boolean(plan.enabled)) return { enabled }
  const decision=await requestGroupPlanChange({ userId:user._id,plan,type:'SET_ENABLED',payload:{ enabled } })
  if (decision.approvalRequired) return { approvalRequired:true,request:decision.request }
  const result=await applyPlanChange(decision.change,localDate)
  await broadcastGroupPlanChange({ actor:user,change:decision.change,sourceId:requestId })
  return result
}
async function deletePlan({ user, event, localDate, requestId }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!isExecutionPlan(plan)) throw fail('INVALID_PARAMETER', '请使用长期目标删除入口')
  if(plan.managedByGoalId)throw fail('INVALID_PARAMETER','该任务由数量积累目标管理，请结束或删除长期目标')
  const decision=await requestGroupPlanChange({ userId:user._id,plan,type:'DELETE' })
  if (decision.approvalRequired) return { approvalRequired:true,request:decision.request }
  const result=await applyPlanChange(decision.change,localDate)
  await broadcastGroupPlanChange({ actor:user,change:decision.change,sourceId:requestId })
  return result
}
async function getPlans({ user, localDate }) {
  const context = await longTermContext(user._id, localDate)
  const newestFirst = items => items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return { plans: newestFirst(context.plans), goals: newestFirst(context.goals) }
}
async function completePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (isLongTermGoal(plan)) throw fail('INVALID_PARAMETER', '长期目标不能直接打卡')
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
  const goalSync = await syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true }).catch(error => {
    console.warn('[long-term-goal-sync]', error?.message || error)
    return { achievedGoals: [] }
  })
  return { checkin, dailyReview, achievedGoals: goalSync.achievedGoals }
}
function roundTimerMinutes(seconds) { const value = Number(seconds); return Number.isFinite(value) && value >= 0 ? Math.round(value / 6) / 10 : null }
module.exports = { createPlan, getPlan, updatePlan, setPlanEnabled, deletePlan, getPlans, completePlan }
