const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { decorateGoals } = require('../domain/long-term-goal')
const { isExecutionPlan, isLongTermGoal } = require('../domain/plan-definition')
const { notifyGoalAchieved } = require('./goal-reminders')

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
  if (!goals.length) return { plans: executionPlans, goals: [], checkins: [] }
  const checkins = await allMatches(C.CHECKINS, { userId, completed: true })
  const allExecutionPlans = plans.filter(isExecutionPlan)
  return { plans: executionPlans, goals: decorateGoals(goals, allExecutionPlans, checkins, localDate), checkins }
}

function achievementSatisfied(goal) {
  if (goal.goalType === 'HABIT') return Number(goal.currentValue) >= Number(goal.targetValue)
  return goal.goalType === 'ACCUMULATION' && !goal.unlimited
    && Number(goal.targetValue) > 0 && Number(goal.currentValue) >= Number(goal.targetValue)
}

async function syncLongTermGoalAchievements(userId, localDate, options = {}) {
  const context = await longTermContext(userId, localDate)
  const achieved = context.goals.filter(goal => goal.goalStatus === 'ACTIVE' && achievementSatisfied(goal))
  const reopened = options.allowReopen ? context.goals.filter(goal => goal.goalStatus === 'COMPLETED'
    && goal.completionMode === 'AUTOMATIC' && !achievementSatisfied(goal)) : []
  const timestamp = now()
  for (const goal of achieved) {
    await notifyGoalAchieved(userId,goal,timestamp).catch(error => console.warn('[goal-achieved-reminder]',error?.message || error))
    await db.collection(C.PLANS).doc(goal._id).update({ data: {
      goalStatus:'COMPLETED',enabled:false,completionMode:'AUTOMATIC',completedAt:timestamp,updatedAt:timestamp
    } })
  }
  await Promise.all(reopened.map(goal => db.collection(C.PLANS).doc(goal._id).update({ data: {
      goalStatus: 'ACTIVE', enabled: true, completionMode: null, completedAt: null, updatedAt: timestamp
    } })))
  return {
    achievedGoals: achieved.map(goal => ({ _id: goal._id, name: goal.name, goalType: goal.goalType })),
    reopenedGoalIds: reopened.map(goal => goal._id)
  }
}

module.exports = { allMatches, longTermContext, syncLongTermGoalAchievements }
