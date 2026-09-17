const { db, C } = require('../lib/db')
const { EXERCISE_MET } = require('../lib/constants')
const { now, fail, sanitizeNumber } = require('../lib/utils')
const { latestWeight } = require('../services/nutrition')
const { workoutSummary } = require('../services/summaries')
const { completePlan } = require('./plans')
const { calculateExerciseCalories } = require('../domain/exercise-calculator')

async function getExercises() {
  const result = await db.collection(C.EXERCISES).where({ enabled: true }).orderBy('sort', 'asc').limit(100).get()
  return { exercises: result.data }
}

async function addWorkout({ user, event, localDate }) {
  const durationMinutes = sanitizeNumber(event.durationMinutes, 1, 1440)
  if (durationMinutes == null) throw fail('INVALID_PARAMETER', '运动时长不合法')
  const weight = await latestWeight(user._id)
  if (!weight) throw fail('WEIGHT_UPDATE_REQUIRED', '请先记录体重')
  const met = sanitizeNumber(event.met == null ? (EXERCISE_MET[event.exerciseKey] || 5) : event.met, 1, 20)
  if (met == null) throw fail('INVALID_PARAMETER', '运动强度参数不合法')
  const calories = calculateExerciseCalories({ met, weightKg: weight.weightKg, durationMinutes })

  let linkedPlan = null
  if (event.planId) {
    linkedPlan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
    if (!linkedPlan || linkedPlan.userId !== user._id || linkedPlan.category !== 'WORKOUT' || !linkedPlan.enabled || linkedPlan.deletedAt) {
      throw fail('PLAN_NOT_FOUND', '关联的健身计划不存在')
    }
  }

  const sets = Array.isArray(event.sets) ? event.sets.slice(0, 100).map(set => ({
    weightKg: Math.max(0, Number(set.weightKg || 0)),
    reps: Math.max(0, Math.round(Number(set.reps || 0))),
    setsCount: Math.max(0, Math.round(Number(set.setsCount || 0)))
  })) : []
  const data = {
    userId: user._id, planId: event.planId || null, recordDate: localDate,
    exerciseKey: event.exerciseKey || 'CUSTOM', exerciseName: String(event.exerciseName || '运动').slice(0, 80),
    category: event.category || 'OTHER', durationMinutes, intensity: event.intensity || 'MEDIUM',
    weightSnapshot: weight.weightKg, metValue: met, estimatedCalories: calories,
    note: String(event.note || '').slice(0, 500), sets, createdAt: now()
  }
  const add = await db.collection(C.WORKOUTS).add({ data })

  let planAutoCompleted = false
  if (linkedPlan) {
    const linked = await db.collection(C.WORKOUTS).where({ userId: user._id, planId: linkedPlan._id, recordDate: localDate }).get()
    const durationTotal = linked.data.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0)
    const shouldComplete = linkedPlan.targetType === 'BOOLEAN'
      || (linkedPlan.targetType === 'DURATION' && durationTotal >= Number(linkedPlan.targetValue || 0))
      || (linkedPlan.targetType === 'COUNT' && linked.data.length >= Number(linkedPlan.targetValue || 0))
    if (shouldComplete) {
      await completePlan({ user, event: {
        planId: linkedPlan._id,
        actualValue: linkedPlan.targetType === 'DURATION' ? durationTotal : linked.data.length,
        durationMinutes: durationTotal,
        note: data.note
      }, localDate })
      planAutoCompleted = true
    }
  }
  return { workout: { _id: add._id, ...data }, summary: await workoutSummary(user._id, localDate), planAutoCompleted }
}

async function getDailyWorkouts({ user, localDate }) {
  const result = await db.collection(C.WORKOUTS).where({ userId: user._id, recordDate: localDate }).orderBy('createdAt', 'desc').get()
  return { workouts: result.data, summary: await workoutSummary(user._id, localDate) }
}

module.exports = { getExercises, addWorkout, getDailyWorkouts }
