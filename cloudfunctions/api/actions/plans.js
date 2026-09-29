const { recordExecutionHistory } = require('../domain/execution-history')
const { completionRecord } = require('../domain/completion-record')
const { db, _, C } = require('../lib/db')
const { now, fail, weekRange } = require('../lib/utils')
const { isBasePlanDue, getTodayPlans } = require('../services/plans')
const { emitGroupEventsForCheckin } = require('../services/social')
const { syncPlanCategoryRecord } = require('../services/plan-records')
const { ensureDailyReviewAfterCompletion,dailyReviewStreak } = require('../services/daily-reviews')
const { normalizePlan, isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { longTermContext, syncLongTermGoalAchievements } = require('../services/long-term-goals')
const { requestGroupPlanChange, applyPlanChange } = require('../services/group-plan-changes')
const { broadcastGroupPlanChange } = require('../services/group-plan-broadcasts')
const { prepareManagedAccumulationPlanUpdate } = require('../services/managed-accumulation')
const { saveExecutionCheckin } = require('../services/checkin-storage')
const { todayForUser } = require('../domain/makeup-cards')
async function createPlan({ user, event, localDate }) {
  const data = { userId: user._id, ...normalizePlan(event.plan, localDate), enabled: true, createdAt: now(), updatedAt: now() }
  data.scheduleHistory = recordExecutionHistory(data, {}, localDate)
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
  if (localDate !== todayForUser(user)) throw fail('MAKEUP_REQUIRED', '过了零点请到日历使用补签卡')
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (isLongTermGoal(plan)) throw fail('INVALID_PARAMETER', '长期目标不能直接打卡')
  const cr = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  if (!plan.enabled && !cr.data.length) throw fail('PLAN_DISABLED', '计划已停用')
  if (!isBasePlanDue(plan, localDate) && !cr.data.length) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')
  if (plan.repeatType === 'WEEKLY_COUNT' && !cr.data.length) {
    const { startDate, endDate } = weekRange(localDate)
    const count = await db.collection(C.CHECKINS).where({
      userId: user._id, planId: plan._id, date: _.gte(startDate).and(_.lte(endDate)), completed: true
    }).count()
    if (count.total >= Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)) throw fail('PLAN_WEEKLY_TARGET_REACHED', '本周目标已完成')
  }

  const completionTime = now()
  const saved = await saveExecutionCheckin({ db,C,userId:user._id,planId:plan._id,date:localDate,existingId:cr.data[0]?._id,
    build:(existing,currentPlan) => completionRecord(currentPlan,existing,event,completionTime,localDate)
  })
  const checkin = saved.checkin
  const shouldEmitGroupEvent = !saved.wasCompleted
  const categoryRecordPromise = syncPlanCategoryRecord({ user, plan, checkin, localDate }).catch(error => {
    console.warn('[plan-category-record]', error?.message || error)
  })
  const socialPromise = shouldEmitGroupEvent ? emitGroupEventsForCheckin(user, plan, checkin).catch(error => {
    console.warn('[social-checkin]', error?.message || error)
  }) : Promise.resolve()
  const dailyStatePromise = getTodayPlans(user._id, localDate).then(async plans => {
    const dailyReview = await ensureDailyReviewAfterCompletion(user._id, localDate, plans).catch(error => {
      console.warn('[auto-daily-review]', error?.message || error)
      return null
    })
    const currentStreak = dailyReview ? await dailyReviewStreak(user._id,localDate).catch(error => {
      console.warn('[daily-review-streak]',error?.message || error)
      return null
    }) : null
    return { plans,dailyReview,currentStreak }
  }).catch(error => {
    console.warn('[today-plan-refresh]', error?.message || error)
    return { plans: null, dailyReview: null }
  })
  const goalSyncPromise = syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true, plan }).catch(error => {
    console.warn('[long-term-goal-sync]', error?.message || error)
    return { achievedGoals: [] }
  })
  const [, , dailyState, goalSync] = await Promise.all([
    categoryRecordPromise, socialPromise, dailyStatePromise, goalSyncPromise
  ])
  return {
    checkin,
    dailyReview: dailyState.dailyReview,
    currentStreak:dailyState.currentStreak,
    plans: dailyState.plans,
    completion: Array.isArray(dailyState.plans) ? {
      total: dailyState.plans.length,
      completed: dailyState.plans.filter(item => item.completed).length
    } : null,
    updatedGoals:goalSync.updatedGoals,
    achievedGoals: goalSync.achievedGoals
  }
}
module.exports = { createPlan, getPlan, updatePlan, setPlanEnabled, deletePlan, getPlans, completePlan }
