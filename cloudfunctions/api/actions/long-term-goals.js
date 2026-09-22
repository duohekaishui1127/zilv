const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { normalizeLongTermGoal, isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { EXAM_RESULT_STATUSES } = require('../domain/exam-progress')
const { allMatches,longTermContext,syncLongTermGoalAchievements,archiveAccumulationGoal } = require('../services/long-term-goals')
const { managedPlanData,ensureManagedAccumulationPlan } = require('../services/managed-accumulation')

async function ownedPlan(userId, planId) {
  const plan = await db.collection(C.PLANS).doc(planId).get().then(result => result.data).catch(() => null)
  if (!plan || plan.userId !== userId || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  return plan
}

async function createLongTermGoal({ user, event, localDate }) {
  const timestamp = now()
  const normalized=normalizeLongTermGoal(event.goal,localDate)
  if(normalized.goalType === 'ACCUMULATION')managedPlanData({ _id:'pending',...normalized },event.goal,localDate)
  const data = {
    userId:user._id,...normalized,
    deadlineReminderDaysSent: [],
    enabled: true, createdAt: timestamp, updatedAt: timestamp
  }
  const result = await db.collection(C.PLANS).add({ data })
  let goal={ _id:result._id,...data }
  if(goal.goalType === 'ACCUMULATION') {
    const plan=await ensureManagedAccumulationPlan(user._id,goal,event.goal,localDate)
    goal={ ...goal,managedExecutionPlanId:plan._id }
  }
  return { goal }
}

async function updateLongTermGoal({ user, event, localDate }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  if(event.goal?.goalType && event.goal.goalType !== goal.goalType)throw fail('INVALID_PARAMETER','长期目标创建后不能更改类型')
  const normalized = normalizeLongTermGoal(event.goal, localDate, goal)
  const data = {
    ...normalized,
    deadlineReminderDaysSent: normalized.goalType === 'DEADLINE'
      && goal.goalType === 'DEADLINE' && normalized.deadlineDate === goal.deadlineDate
      ? (goal.deadlineReminderDaysSent || []) : [],
    updatedAt: now()
  }
  await db.collection(C.PLANS).doc(goal._id).update({ data })
  if(normalized.goalType === 'ACCUMULATION') {
    const plan=await ensureManagedAccumulationPlan(user._id,{ ...goal,...data },event.goal,localDate)
    data.managedExecutionPlanId=plan._id
  }
  const sync = await syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true })
  return { goal: { ...goal, ...data }, achievedGoals: sync.achievedGoals }
}

async function deleteLongTermGoal({ user, event, localDate }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  if(goal.goalType === 'ACCUMULATION') {
    await archiveAccumulationGoal(user._id,goal._id,localDate)
    return { deleted:true,archived:true }
  }
  const timestamp = now()
  await db.collection(C.PLANS).doc(goal._id).update({ data: { enabled: false, deletedAt: timestamp, updatedAt: timestamp } })
  const plans = await allMatches(C.PLANS, { userId: user._id })
  await Promise.all(plans.filter(plan => Array.isArray(plan.longTermGoalIds) && plan.longTermGoalIds.includes(goal._id))
    .map(plan => db.collection(C.PLANS).doc(plan._id).update({ data: {
      longTermGoalIds: plan.longTermGoalIds.filter(id => id !== goal._id), updatedAt: timestamp
    } })))
  return { deleted: true }
}

async function completeLongTermGoal({ user, event, localDate }) {
  const goal = await ownedPlan(user._id, event.goalId)
  if (!isLongTermGoal(goal)) throw fail('INVALID_PARAMETER', '这不是长期目标')
  if (goal.goalType === 'DEADLINE') throw fail('INVALID_PARAMETER', '考试目标会在考试日期自动归档')
  if(goal.goalType === 'ACCUMULATION') {
    await archiveAccumulationGoal(user._id,goal._id,localDate)
    return { completed:true,archived:true,completionMode:'TERMINATED' }
  }
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
  if(plan.managedByGoalId)throw fail('INVALID_PARAMETER','系统托管任务不能手动关联其他长期目标')
  if(goal.goalType === 'ACCUMULATION')throw fail('INVALID_PARAMETER','数量积累目标会自动创建执行任务，无需手动关联')
  if (event.bound && goal.goalType === 'HABIT' && plan.repeatType === 'WEEKLY_COUNT') {
    throw fail('INVALID_PARAMETER', '习惯养成请绑定具有明确执行日的任务')
  }
  const current = Array.isArray(plan.longTermGoalIds) ? plan.longTermGoalIds : []
  const next = event.bound
    ? [...new Set([...current, goal._id])].slice(0, 20)
    : current.filter(id => id !== goal._id)
  const timestamp=now()
  const writes=[db.collection(C.PLANS).doc(plan._id).update({ data:{ longTermGoalIds:next,updatedAt:timestamp } })]
  const history=Array.isArray(goal.linkedPlanHistory) ? goal.linkedPlanHistory : []
  if(event.bound && !history.some(item => item.planId === plan._id)) {
    writes.push(db.collection(C.PLANS).doc(goal._id).update({ data:{
      linkedPlanHistory:[...history,{
        planId:plan._id,name:plan.name,category:plan.category || 'CUSTOM',boundAt:timestamp
      }].slice(-50),updatedAt:timestamp
    } }))
  }
  await Promise.all(writes)
  const sync = await syncLongTermGoalAchievements(user._id, localDate, { allowReopen: true })
  return { bound: Boolean(event.bound), longTermGoalIds: next, achievedGoals: sync.achievedGoals }
}

async function getLongTermGoals({ user, localDate }) {
  const context = await longTermContext(user._id, localDate)
  return { goals: context.goals }
}

async function getProgressGoals({ user, localDate }) {
  const context=await longTermContext(user._id,localDate)
  const goals=context.goals.filter(goal => goal.goalStatus === 'COMPLETED')
    .sort((a,b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0))
  return { goals }
}

async function getProgressGoal({ user, event, localDate }) {
  const context=await longTermContext(user._id,localDate)
  const goal=context.goals.find(item => item._id === event.goalId && item.goalStatus === 'COMPLETED')
  if(!goal)throw fail('PLAN_NOT_FOUND','进步记录不存在')
  return { goal }
}

async function updateExamGoalResult({ user, event }) {
  const goal=await ownedPlan(user._id,event.goalId)
  if(!isLongTermGoal(goal) || goal.goalType !== 'DEADLINE' || goal.goalStatus !== 'COMPLETED') {
    throw fail('INVALID_PARAMETER','只能更新已归档考试的结果')
  }
  const resultStatus=String(event.resultStatus || 'PENDING').toUpperCase()
  if(!EXAM_RESULT_STATUSES.includes(resultStatus))throw fail('INVALID_PARAMETER','考试结果不合法')
  const timestamp=now()
  const data={
    examResultStatus:resultStatus,
    examScore:String(event.score ?? '').trim().slice(0,40),
    examReview:String(event.review ?? '').trim().slice(0,2000),
    examResultUpdatedAt:timestamp,updatedAt:timestamp
  }
  await db.collection(C.PLANS).doc(goal._id).update({ data })
  return { goal:{ ...goal,...data } }
}

module.exports = {
  createLongTermGoal, updateLongTermGoal, deleteLongTermGoal,
  completeLongTermGoal, setPlanLongTermGoalBinding, getLongTermGoals,
  getProgressGoals,getProgressGoal,updateExamGoalResult
}
