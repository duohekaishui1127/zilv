const { db, C } = require('../lib/db')
const { round1 } = require('../lib/utils')

async function nutritionSummary(userId, dateStr) {
  const items = await db.collection(C.MEAL_ITEMS).where({ userId, recordDate: dateStr }).get()
  const sum = items.data.reduce((a, x) => {
    a.calorieIntake += Number(x.energyKcal || 0)
    a.proteinIntake += Number(x.proteinGram || 0)
    a.carbIntake += Number(x.carbGram || 0)
    a.fatIntake += Number(x.fatGram || 0)
    return a
  }, { calorieIntake: 0, proteinIntake: 0, carbIntake: 0, fatIntake: 0 })
  Object.keys(sum).forEach(k => { sum[k] = round1(sum[k]) })
  return sum
}

async function workoutSummary(userId, dateStr) {
  const r = await db.collection(C.WORKOUTS).where({ userId, recordDate: dateStr }).get()
  return r.data.reduce((a, x) => ({
    estimatedCalories: round1(a.estimatedCalories + Number(x.estimatedCalories || 0)),
    durationMinutes: a.durationMinutes + Number(x.durationMinutes || 0),
    count: a.count + 1
  }), { estimatedCalories: 0, durationMinutes: 0, count: 0 })
}

async function studySummary(userId, dateStr) {
  const r = await db.collection(C.STUDY).where({ userId, recordDate: dateStr }).get()
  return {
    durationMinutes: r.data.reduce((a, x) => a + Number(x.durationMinutes || 0), 0),
    count: r.data.length
  }
}

async function ensureMeal(userId, dateStr, mealType) {
  const r = await db.collection(C.MEALS).where({ userId, recordDate: dateStr, mealType }).limit(1).get()
  if (r.data.length) return r.data[0]
  const data = { userId, recordDate: dateStr, mealType, createdAt: new Date() }
  const add = await db.collection(C.MEALS).add({ data })
  return { _id: add._id, ...data }
}

module.exports = { nutritionSummary, workoutSummary, studySummary, ensureMeal }
