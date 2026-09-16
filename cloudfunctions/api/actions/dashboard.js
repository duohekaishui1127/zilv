const { round1 } = require('../lib/utils')
const { latestWeight, weightStatus, currentNutritionTarget, recalcNutritionTarget } = require('../services/nutrition')
const { getTodayPlans: getTodayPlansService } = require('../services/plans')
const { nutritionSummary, workoutSummary, studySummary } = require('../services/summaries')

async function dashboard({ user, localDate }) {
  const [weight, plans, nutrition, workout, study] = await Promise.all([
    latestWeight(user._id),
    getTodayPlansService(user._id, localDate),
    nutritionSummary(user._id, localDate),
    workoutSummary(user._id, localDate),
    studySummary(user._id, localDate)
  ])
  let target = await currentNutritionTarget(user._id)
  if (!target && weight) target = await recalcNutritionTarget(user, localDate)
  const base = Number(target?.baseDailyExpenditure || 0)
  const totalExpenditure = round1(base + workout.estimatedCalories)
  const balance = round1(nutrition.calorieIntake - totalExpenditure)
  return {
    user: { _id: user._id, nickname: user.nickname, avatar: user.avatar, shareCode: user.shareCode },
    weightStatus: weightStatus(weight, localDate),
    nutritionTarget: target,
    plans,
    nutrition,
    workout,
    study,
    energy: {
      baseDailyExpenditure: base,
      exerciseExpenditure: workout.estimatedCalories,
      estimatedTotalExpenditure: totalExpenditure,
      calorieIntake: nutrition.calorieIntake,
      estimatedCalorieBalance: balance,
      estimatedDeficit: balance < 0 ? Math.abs(balance) : 0,
      estimatedSurplus: balance > 0 ? balance : 0
    },
    completion: { total: plans.length, completed: plans.filter(plan => plan.completed).length }
  }
}

async function getTodayPlansAction({ user, localDate }) {
  return { plans: await getTodayPlansService(user._id, localDate) }
}

module.exports = { dashboard, getTodayPlans: getTodayPlansAction }
