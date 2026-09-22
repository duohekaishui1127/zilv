const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { normalizeLongTermGoal, isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { allMatches, longTermContext, syncLongTermGoalAchievements } = require('../services/long-term-goals')

async function ownedPlan(userId, planId) {
  const plan = await db.collection(C.PLANS).doc(planId).get().then(result => result.data).catch(() => null)
  if (!plan || plan.userId !== userId || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  return plan
}

async function createLongTermGoal({ user, event, localDate }) {
  const timestamp = now()
  const data = {
    userId: user._id, ...normalizeLongTermGoal(event.goal, localDate),
    wechatReminderEnabled: event.reminderGrantAccepted === true,
    deadlineReminderDaysSent: [],
    enabled: true, createdAt: timestamp, updatedAt: timestamp
  }
  const result = await db.collection(C.PLANS).add({ data })
  return { goal: { _id: result._id, ...data } }
}

async function updateLongTermGoal({ user, event, localDate }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  const normalized = normalizeLongTermGoal(event.goal, localDate, goal)
  const data = {
    ...normalized,
    wechatReminderEnabled: normalized.reminderEnabled
      ? (event.reminderGrantAccepted === true || Boolean(goal.wechatReminderEnabled))
      : false,
    deadlineReminderDaysSent: normalized.goalType === 'DEADLINE'
      && goal.goalType === 'DEADLINE' && normalized.deadlineDate === goal.deadlineDate
      ? (goal.deadlineReminderDaysSent || []) : [],
    updatedAt: now()
  }
  await db.collection(C.PLANS).doc(goal._id).update({ data })
  const sync = await syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true })
  return { goal: { ...goal, ...data }, achievedGoals: sync.achievedGoals }
}

async function deleteLongTermGoal({ user, event }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  const timestamp = now()
  await db.collection(C.PLANS).doc(goal._id).update({ data: { enabled: false, deletedAt: timestamp, updatedAt: timestamp } })
  const plans = await allMatches(C.PLANS, { userId: user._id })
  await Promise.all(plans.filter(plan => Array.isArray(plan.longTermGoalIds) && plan.longTermGoalIds.includes(goal._id))
    .map(plan => db.collection(C.PLANS).doc(plan._id).update({ data: {
      longTermGoalIds: plan.longTermGoalIds.filter(id => id !== goal._id), updatedAt: timestamp
    } })))
  return { deleted: true }
}

async function completeLongTermGoal({ user, event }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  const timestamp = now()
  await db.collection(C.PLANS).doc(goal._id).update({ data: {
    goalStatus: 'COMPLETED', enabled: false, completionMode: 'MANUAL', completedAt: timestamp, updatedAt: timestamp
  } })
  return { completed: true }
}

async function setPlanLongTermGoalBinding({ user, event, localDate }) {
  const [plan, goal] = await Promise.all([
    ownedPlan(user._id, event.planId), ownedPlan(user._id, event.goalId)
  ])
  if (!isExecutionPlan(plan) || !isLongTermGoal(goal) || goal.goalStatus !== 'ACTIVE') {
    throw fail('INVALID_PARAMETER', '只能把执行任务绑定到进行中的长期目标')
  }
  if (event.bound && goal.goalType === 'HABIT' && plan.repeatType === 'WEEKLY_COUNT') {
    throw fail('INVALID_PARAMETER', '习惯养成请绑定具有明确执行日的任务')
  }
  const current = Array.isArray(plan.longTermGoalIds) ? plan.longTermGoalIds : []
  const next = event.bound
    ? [...new Set([...current, goal._id])].slice(0, 20)
    : current.filter(id => id !== goal._id)
  await db.collection(C.PLANS).doc(plan._id).update({ data: { longTermGoalIds: next, updatedAt: now() } })
  const sync = await syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true })
  return { bound: Boolean(event.bound), longTermGoalIds: next, achievedGoals: sync.achievedGoals }
}

async function getLongTermGoals({ user, localDate }) {
  const context = await longTermContext(user._id, localDate)
  return { goals: context.goals }
}

module.exports = {
  createLongTermGoal, updateLongTermGoal, deleteLongTermGoal,
  completeLongTermGoal, setPlanLongTermGoalBinding, getLongTermGoals
}
