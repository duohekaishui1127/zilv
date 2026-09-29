const { executionSnapshot } = require('../domain/execution-history')
const crypto = require('crypto')
const { db, _, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { getTodayPlans } = require('./plans')
const { streakFromDates, presentDailyReview } = require('../domain/daily-review')
const { shiftDate } = require('../domain/review-period')
const { txRead } = require('./checkin-storage')

async function getDailyReview(userId, date) {
  const result = await db.collection(C.DAILY_REVIEWS).where({ userId, date }).limit(1).get()
  return result.data[0] || null
}

function dailyReviewId(userId, date) {
  return crypto.createHash('sha256').update(`daily-review:${userId}:${date}`).digest('hex').slice(0, 32)
}

async function upsertReview(userId,date,id,data) {
  const output = await db.runTransaction(async transaction => {
    const current = await txRead(transaction,C.DAILY_REVIEWS,id)
    if (current && (current.userId !== userId || current.date !== date)) throw { success:false,code:'INVALID_PARAMETER',message:'打卡记录不匹配' }
    if (current && new Date(current.updatedAt).getTime() > new Date(data.updatedAt).getTime()) return presentDailyReview(current)
    const fields = { ...data }
    if (current) {
      delete fields.mood; delete fields.note; delete fields.createdAt; delete fields.checkedInAt
      fields.checkinMode = current.checkinMode || fields.checkinMode
      fields.autoCompleted = current.autoCompleted === false ? false : fields.autoCompleted
      await transaction.collection(C.DAILY_REVIEWS).doc(id).update({ data:fields })
    } else await transaction.collection(C.DAILY_REVIEWS).doc(id).set({ data:{ userId,date,...fields } })
    return presentDailyReview({ ...(current || { userId,date }),...fields,_id:id })
  })
  return output?.result || output
}

async function ensureDailyReviewAfterCompletion(userId, date, suppliedPlans) {
  const plans = suppliedPlans || await getTodayPlans(userId, date)
  if (!plans.length || plans.some(plan => !plan.completed)) return null
  const existing = await getDailyReview(userId, date)
  const timestamp = now()
  if (existing) {
    const data = {
      status: 'ACTIVE',
      revokedAt: null,
      revokedByPlanId: '',
      completedPlanCount: plans.length,
      taskSnapshot: plans.map(plan => ({ planId:plan._id,...executionSnapshot(plan) })),
      totalPlanCount: plans.length,
      allPlansCompleted: true,
      checkinMode: existing.checkinMode || (existing.autoCompleted === false ? 'MANUAL' : 'AUTO'),
      autoCompleted: existing.autoCompleted !== false,
      updatedAt: timestamp
    }
    if (existing.status === 'REVOKED') data.reactivatedAt = timestamp
    return upsertReview(userId,date,existing._id,data)
  }
  const data = {
    userId,
    date,
    status: 'ACTIVE',
    mood: '',
    note: '',
    completedPlanCount: plans.length,
    taskSnapshot: plans.map(plan => ({ planId:plan._id,...executionSnapshot(plan) })),
    totalPlanCount: plans.length,
    allPlansCompleted: true,
    checkinMode: 'AUTO',
    autoCompleted: true,
    checkedInAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const id = dailyReviewId(userId, date)
  return upsertReview(userId,date,id,data)
}

async function createManualDailyReview(userId, date, suppliedPlans) {
  const plans = suppliedPlans || await getTodayPlans(userId, date)
  const completedPlanCount = plans.filter(plan => plan.completed).length
  const totalPlanCount = plans.length
  const completed = totalPlanCount > 0 && completedPlanCount === totalPlanCount
  const existing = await getDailyReview(userId, date)
  const timestamp = now()
  if (existing) {
    const active = existing.status !== 'REVOKED'
    const data = {
      status: 'ACTIVE',
      revokedAt: null,
      revokedByPlanId: '',
      completedPlanCount,
      taskSnapshot: plans.map(plan => ({ planId:plan._id,...executionSnapshot(plan) })),
      totalPlanCount,
      allPlansCompleted: completed,
      checkinMode: active ? (existing.checkinMode || (existing.autoCompleted === false ? 'MANUAL' : 'AUTO')) : 'MANUAL',
      autoCompleted: active ? existing.autoCompleted !== false : false,
      checkedInAt: existing.checkedInAt || timestamp,
      updatedAt: timestamp
    }
    if (!active) data.reactivatedAt = timestamp
    return upsertReview(userId,date,existing._id,data)
  }
  const data = {
    userId,
    date,
    status: 'ACTIVE',
    mood: '',
    note: '',
    completedPlanCount,
    taskSnapshot: plans.map(plan => ({ planId:plan._id,...executionSnapshot(plan) })),
    totalPlanCount,
    allPlansCompleted: completed,
    checkinMode: 'MANUAL',
    autoCompleted: false,
    checkedInAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const id = dailyReviewId(userId, date)
  return upsertReview(userId,date,id,data)
}

async function dailyReviewStreak(userId, date) {
  const dates = []
  const pageSize = 100
  for (let offset = 0; offset < 3700; offset += pageSize) {
    const result = await db.collection(C.DAILY_REVIEWS)
      .where({ userId,date:_.lte(date) })
      .orderBy('date','desc')
      .skip(offset)
      .limit(pageSize)
      .get()
    dates.push(...result.data.filter(item => item.status !== 'REVOKED' && item.date <= date).map(item => item.date))
    const streak = streakFromDates(dates,date)
    if (result.data.length < pageSize || result.data.some(item => item.date < shiftDate(date,-streak))) return streak
  }
  return streakFromDates(dates, date)
}

async function revokeDailyReview(userId, date, planId, suppliedPlans) {
  const existing = await getDailyReview(userId, date)
  if (!existing || existing.status === 'REVOKED') return existing
  const plans = suppliedPlans || await getTodayPlans(userId,date)
  const completedPlanCount = plans.filter(plan => plan.completed).length
  const data = {
    completedPlanCount,
    taskSnapshot: plans.map(plan => ({ planId:plan._id,...executionSnapshot(plan) })),
    totalPlanCount: plans.length,
    allPlansCompleted: plans.length > 0 && completedPlanCount === plans.length,
    lastIncompleteByPlanId: planId,
    updatedAt: now()
  }
  return upsertReview(userId,date,existing._id,data)
}

module.exports = {
  getDailyReview,
  ensureDailyReviewAfterCompletion,
  createManualDailyReview,
  dailyReviewStreak,
  revokeDailyReview
}
