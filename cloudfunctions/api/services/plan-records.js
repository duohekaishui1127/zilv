const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')

function durationOf(plan, checkin) {
  if (checkin.durationMinutes != null) return Number(checkin.durationMinutes || 0)
  if (plan.targetType === 'DURATION') return Number(checkin.actualValue || 0)
  return 0
}

function hasCompletionDetails(checkin) {
  return checkin.timerStatus === 'FINISHED' || Number(checkin.durationMinutes || 0) > 0 || !!checkin.mood || !!checkin.note
}

function timerFields(checkin) {
  if (!checkin.timerStatus) return {}
  return {
    timerMode: checkin.timerMode || '',
    timerEffectiveSeconds: Number(checkin.timerEffectiveSeconds || 0),
    timerTotalSeconds: Number(checkin.timerTotalSeconds || 0),
    timerPausedSeconds: Number(checkin.timerPausedSeconds || 0)
  }
}

function latest(items) {
  return [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null
}

async function relatedRecords(collection, userId, planId, recordDate) {
  const result = await db.collection(collection).where({ userId, planId, recordDate }).limit(100).get()
  return result.data
}

async function syncStudyRecord(user, plan, checkin, localDate) {
  const records = await relatedRecords(C.STUDY, user._id, plan._id, localDate)
  const generated = records.find(item => item.source === 'PLAN_CHECKIN')
  if (!hasCompletionDetails(checkin)) {
    if (generated) await db.collection(C.STUDY).doc(generated._id).remove()
    return
  }
  if (generated) {
    const data = {
      subject: plan.name,
      content: plan.description || '',
      durationMinutes: durationOf(plan, checkin),
      mood: checkin.mood || '',
      note: checkin.note || '',
      ...timerFields(checkin),
      updatedAt: now()
    }
    await db.collection(C.STUDY).doc(generated._id).update({ data })
    return
  }
  const manual = latest(records)
  if (manual) {
    await db.collection(C.STUDY).doc(manual._id).update({ data: {
      mood: checkin.mood || '', completionNote: checkin.note || '', ...timerFields(checkin), updatedAt: now()
    } })
    return
  }
  await db.collection(C.STUDY).add({ data: {
    userId: user._id,
    planId: plan._id,
    checkinId: checkin._id,
    recordDate: localDate,
    subject: plan.name,
    content: plan.description || '',
    durationMinutes: durationOf(plan, checkin),
    mood: checkin.mood || '',
    note: checkin.note || '',
    ...timerFields(checkin),
    source: 'PLAN_CHECKIN',
    createdAt: now(),
    updatedAt: now()
  } })
}

async function syncWorkoutRecord(user, plan, checkin, localDate) {
  const records = await relatedRecords(C.WORKOUTS, user._id, plan._id, localDate)
  const generated = records.find(item => item.source === 'PLAN_CHECKIN')
  if (!hasCompletionDetails(checkin)) {
    if (generated) await db.collection(C.WORKOUTS).doc(generated._id).remove()
    return
  }
  if (generated) {
    const data = {
      exerciseName: plan.name,
      durationMinutes: durationOf(plan, checkin),
      mood: checkin.mood || '',
      note: checkin.note || '',
      ...timerFields(checkin),
      updatedAt: now()
    }
    await db.collection(C.WORKOUTS).doc(generated._id).update({ data })
    return
  }
  const manual = latest(records)
  if (manual) {
    await db.collection(C.WORKOUTS).doc(manual._id).update({ data: {
      mood: checkin.mood || '', completionNote: checkin.note || '', ...timerFields(checkin), updatedAt: now()
    } })
    return
  }
  await db.collection(C.WORKOUTS).add({ data: {
    userId: user._id,
    planId: plan._id,
    checkinId: checkin._id,
    recordDate: localDate,
    exerciseKey: 'PLAN_CHECKIN',
    exerciseName: plan.name,
    category: 'OTHER',
    durationMinutes: durationOf(plan, checkin),
    intensity: '',
    weightSnapshot: null,
    metValue: null,
    estimatedCalories: 0,
    mood: checkin.mood || '',
    note: checkin.note || '',
    ...timerFields(checkin),
    sets: [],
    source: 'PLAN_CHECKIN',
    createdAt: now(),
    updatedAt: now()
  } })
}

async function syncPlanCategoryRecord({ user, plan, checkin, localDate }) {
  if (plan.category === 'STUDY') return syncStudyRecord(user, plan, checkin, localDate)
  if (plan.category === 'WORKOUT') return syncWorkoutRecord(user, plan, checkin, localDate)
}

async function revokePlanCategoryRecord({ user, plan, localDate }) {
  const collection = plan.category === 'STUDY' ? C.STUDY : (plan.category === 'WORKOUT' ? C.WORKOUTS : '')
  if (!collection) return
  const records = await relatedRecords(collection, user._id, plan._id, localDate)
  const generated = records.filter(item => item.source === 'PLAN_CHECKIN')
  await Promise.all(generated.map(item => db.collection(collection).doc(item._id).remove()))
}

module.exports = { syncPlanCategoryRecord, revokePlanCategoryRecord }
