const { db, _, C } = require('../lib/db')
const { dateOnly, round1 } = require('../lib/utils')
const { nutritionTargetForDate } = require('../services/nutrition')
const { nutritionSummary, workoutSummary } = require('../services/summaries')


async function getWeeklyReport({ user, localDate }) {
  const end = new Date(`${localDate}T12:00:00`)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  const startDate = dateOnly(start)
  const [bodies, plans, checks] = await Promise.all([
    db.collection(C.BODY).where({ userId: user._id, recordDate: _.gte(startDate).and(_.lte(localDate)) }).orderBy('recordDate', 'asc').get(),
    db.collection(C.PLANS).where({ userId: user._id, enabled: true }).get(),
    db.collection(C.CHECKINS).where({ userId: user._id, date: _.gte(startDate).and(_.lte(localDate)), completed: true }).get()
  ])

  let calorieIn = 0
  let estimatedExpenditure = 0
  let proteinDays = 0
  let nutritionDays = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ds = dateOnly(d)
    const [ns, ws, target] = await Promise.all([
      nutritionSummary(user._id, ds),
      workoutSummary(user._id, ds),
      nutritionTargetForDate(user._id, ds)
    ])
    calorieIn += ns.calorieIntake
    estimatedExpenditure += Number(target?.baseDailyExpenditure || 0) + ws.estimatedCalories
    if (target) {
      nutritionDays++
      if (ns.proteinIntake >= target.proteinGram) proteinDays++
    }
  }

  const averageCalorieIntake = Math.round(calorieIn / 7)
  const averageEstimatedBalance = Math.round((calorieIn - estimatedExpenditure) / 7)
  return {
    weekStart: startDate,
    weekEnd: localDate,
    startWeight: bodies.data[0]?.weightKg || null,
    endWeight: bodies.data[bodies.data.length - 1]?.weightKg || null,
    weightChange: bodies.data.length ? round1(bodies.data[bodies.data.length - 1].weightKg - bodies.data[0].weightKg) : null,
    averageCalorieIntake,
    averageEstimatedBalance,
    proteinSuccessDays: proteinDays,
    proteinTrackedDays: nutritionDays,
    checkinCount: checks.data.length,
    activePlanCount: plans.data.filter(p => !p.deletedAt).length
  }
}

module.exports = { getWeeklyReport }
