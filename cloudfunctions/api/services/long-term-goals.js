const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { decorateGoals } = require('../domain/long-term-goal')
const { isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { examArchiveDue,examProgressSnapshot } = require('../domain/exam-progress')
const { accumulationArchiveSnapshot } = require('../domain/accumulation-plan')
const { notifyGoalAchieved } = require('./goal-reminders')
const { assertNoActiveTimer }=require('./plans')
const {
  syncManagedAccumulationTargets,archiveManagedAccumulationPlan,reopenManagedAccumulationPlan
} = require('./managed-accumulation')

async function allMatches(collection, where) {
  const records = []
  while (true) {
    const result = await db.collection(collection).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if (result.data.length < 100) return records
  }
}

async function longTermContext(userId, localDate) {
  const plans = await allMatches(C.PLANS, { userId })
  const active = plans.filter(item => !item.deletedAt)
  const goals = active.filter(isLongTermGoal)
  const executionPlans = active.filter(isExecutionPlan)
  if (!goals.length) return { plans:executionPlans,allExecutionPlans:plans.filter(isExecutionPlan),goals:[],checkins:[] }
  const checkins = await allMatches(C.CHECKINS, { userId, completed: true })
  const allExecutionPlans = plans.filter(isExecutionPlan)
  const timestamp=now()
  for(const goal of goals) {
    const shouldArchive=examArchiveDue(goal,localDate)
    const needsSnapshot=goal.goalType === 'DEADLINE' && goal.goalStatus === 'COMPLETED'
      && goal.deadlineDate <= localDate && !goal.archiveSnapshot
    if(!shouldArchive && !needsSnapshot)continue
    const data={ archiveSnapshot:examProgressSnapshot(goal,allExecutionPlans,checkins),updatedAt:timestamp }
    if(shouldArchive)Object.assign(data,{
      goalStatus:'COMPLETED',enabled:false,completionMode:'EXAM_DATE',completedAt:timestamp,
      examResultStatus:goal.examResultStatus || 'PENDING'
    })
    await db.collection(C.PLANS).doc(goal._id).update({ data })
    Object.assign(goal,data)
  }
  const context={
    plans:executionPlans,allExecutionPlans,
    goals:decorateGoals(goals,allExecutionPlans,checkins,localDate),checkins
  }
  await syncManagedAccumulationTargets(context,localDate)
  return context
}

function goalIdsForPlan(plan) {
  return [...new Set([
    ...(Array.isArray(plan?.longTermGoalIds) ? plan.longTermGoalIds : []),
    plan?.managedByGoalId || ''
  ].filter(Boolean))]
}

async function longTermContextForPlan(userId, localDate, plan) {
  const goalIds = goalIdsForPlan(plan)
  if (!goalIds.length) return { plans: [], allExecutionPlans: [], goals: [], checkins: [] }
  const plans = await allMatches(C.PLANS, { userId })
  const active = plans.filter(item => !item.deletedAt)
  const goals = active.filter(item => isLongTermGoal(item) && goalIds.includes(item._id))
  if (!goals.length) return { plans: [], allExecutionPlans: plans.filter(isExecutionPlan), goals: [], checkins: [] }
  const allExecutionPlans = plans.filter(isExecutionPlan)
  const linkedPlans = allExecutionPlans.filter(item => Array.isArray(item.longTermGoalIds)
    && item.longTermGoalIds.some(id => goalIds.includes(id)))
  const checkinPages = await Promise.all(linkedPlans.map(item => allMatches(C.CHECKINS, {
    userId, planId: item._id, completed: true
  })))
  const checkins = checkinPages.flat()
  const context = {
    plans: active.filter(isExecutionPlan),
    allExecutionPlans,
    goals: decorateGoals(goals, allExecutionPlans, checkins, localDate),
    checkins
  }
  await syncManagedAccumulationTargets(context, localDate)
  return context
}

function achievementSatisfied(goal) {
  if (goal.goalType === 'HABIT') return Number(goal.currentValue) >= Number(goal.targetValue)
  return goal.goalType === 'ACCUMULATION' && !goal.unlimited
    && Number(goal.targetValue) > 0 && Number(goal.currentValue) >= Number(goal.targetValue)
}

async function syncLongTermGoalAchievements(userId, localDate, options = {}) {
  const context = options.plan
    ? await longTermContextForPlan(userId, localDate, options.plan)
    : await longTermContext(userId, localDate)
  const achieved = context.goals.filter(goal => goal.goalStatus === 'ACTIVE' && achievementSatisfied(goal))
  const reopened = options.allowReopen ? context.goals.filter(goal => goal.goalStatus === 'COMPLETED'
    && goal.completionMode === 'AUTOMATIC' && !achievementSatisfied(goal)) : []
  const timestamp = now()
  for (const goal of achieved) {
    await notifyGoalAchieved(userId,goal,timestamp).catch(error => console.warn('[goal-achieved-reminder]',error?.message || error))
    const data={
      goalStatus:'COMPLETED',enabled:false,completionMode:'AUTOMATIC',completedAt:timestamp,updatedAt:timestamp
    }
    if(goal.goalType === 'ACCUMULATION')data.archiveSnapshot=accumulationArchiveSnapshot(
      goal,context.allExecutionPlans,localDate,'ACHIEVED'
    )
    await db.collection(C.PLANS).doc(goal._id).update({ data })
    if(goal.goalType === 'ACCUMULATION')await archiveManagedAccumulationPlan(goal,'COMPLETED',timestamp)
  }
  await Promise.all(reopened.map(async goal => {
    await db.collection(C.PLANS).doc(goal._id).update({ data: {
      goalStatus:'ACTIVE',enabled:true,completionMode:null,completedAt:null,archiveSnapshot:null,updatedAt:timestamp
    } })
    if(goal.goalType === 'ACCUMULATION')await reopenManagedAccumulationPlan(goal,timestamp)
  }))
  return {
    achievedGoals: achieved.map(goal => ({ _id: goal._id, name: goal.name, goalType: goal.goalType })),
    reopenedGoalIds: reopened.map(goal => goal._id)
  }
}

async function archiveAccumulationGoal(userId,goalId,localDate) {
  const context=await longTermContext(userId,localDate)
  const goal=context.goals.find(item => item._id === goalId && item.goalType === 'ACCUMULATION')
  if(!goal)return null
  if(goal.managedExecutionPlanId)await assertNoActiveTimer(userId,goal.managedExecutionPlanId,localDate)
  const timestamp=now()
  const archiveSnapshot=accumulationArchiveSnapshot(goal,context.allExecutionPlans,localDate,'TERMINATED')
  await db.collection(C.PLANS).doc(goal._id).update({ data:{
    goalStatus:'COMPLETED',enabled:false,completionMode:'TERMINATED',completedAt:timestamp,
    archiveSnapshot,updatedAt:timestamp
  } })
  await archiveManagedAccumulationPlan(goal,'TERMINATED',timestamp)
  return { goal:{ ...goal,goalStatus:'COMPLETED',completionMode:'TERMINATED',archiveSnapshot } }
}

module.exports={
  allMatches,longTermContext,longTermContextForPlan,syncLongTermGoalAchievements,archiveAccumulationGoal
}
