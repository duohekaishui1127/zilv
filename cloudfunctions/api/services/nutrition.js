const { db, _, C } = require('../lib/db')
const { now, dateOnly, daysBetween } = require('../lib/utils')
const { calculateNutrition } = require('../domain/nutrition-calculator')
const { getNutritionProfile } = require('./users')

async function latestWeight(userId) {
  const r = await db.collection(C.BODY).where({ userId, weightKg: _.gt(0) }).orderBy('recordDate', 'desc').limit(1).get()
  return r.data[0] || null
}

function weightStatus(record, today = dateOnly()) {
  if (!record) return { needUpdate: true, lastWeight: null, lastUpdateDate: null, daysSinceUpdate: null }
  const lastUpdateDate = record.recordDate || dateOnly(new Date(record.createdAt))
  const days = daysBetween(lastUpdateDate, today)
  return {
    needUpdate: days == null ? true : days >= 7,
    lastWeight: record.weightKg,
    lastUpdateDate,
    daysSinceUpdate: days
  }
}

async function currentNutritionTarget(userId) {
  const r = await db.collection(C.NUTRITION_TARGETS).where({ userId, effectiveTo: null }).orderBy('effectiveFrom', 'desc').limit(1).get()
  return r.data[0] || null
}

async function recalcNutritionTarget(user, effectiveDate = dateOnly()) {
  const [weight, profile] = await Promise.all([latestWeight(user._id), getNutritionProfile(user._id)])
  if (!weight || !profile) return null
  const calc = calculateNutrition({
    weightKg: weight.weightKg,
    heightCm: user.heightCm,
    birthday: user.birthday,
    sex: user.sex,
    profile
  })
  if (!calc) return null

  const current = await db.collection(C.NUTRITION_TARGETS).where({ userId: user._id, effectiveTo: null }).limit(1).get()
  if (current.data.length) {
    await db.collection(C.NUTRITION_TARGETS).doc(current.data[0]._id).update({
      data: { effectiveTo: now(), effectiveToDate: effectiveDate }
    })
  }

  const data = {
    userId: user._id,
    basedWeightKg: weight.weightKg,
    effectiveFrom: now(),
    effectiveFromDate: effectiveDate,
    effectiveTo: null,
    effectiveToDate: null,
    ...calc,
    createdAt: now()
  }
  const add = await db.collection(C.NUTRITION_TARGETS).add({ data })
  return { _id: add._id, ...data }
}

async function nutritionTargetForDate(userId, dateStr) {
  const r = await db.collection(C.NUTRITION_TARGETS).where({ userId }).orderBy('effectiveFrom', 'desc').limit(100).get()
  const byDate = r.data.find(t => {
    const from = t.effectiveFromDate || dateOnly(new Date(t.effectiveFrom))
    const to = t.effectiveToDate || (t.effectiveTo ? dateOnly(new Date(t.effectiveTo)) : null)
    return from <= dateStr && (!to || dateStr <= to)
  })
  return byDate || null
}

module.exports = {
  latestWeight,
  weightStatus,
  calculateNutrition,
  currentNutritionTarget,
  recalcNutritionTarget,
  nutritionTargetForDate
}
