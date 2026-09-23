const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { getTodayPlans } = require('./plans')
const { streakFromDates, presentDailyReview } = require('../domain/daily-review')

async function getDailyReview(userId, date) {
  const result = await db.collection(C.DAILY_REVIEWS).where({ userId, date }).limit(1).get()
  return result.data[0] || null
}

function dailyReviewId(userId, date) {
  return crypto.createHash('sha256').update(`daily-review:${userId}:${date}`).digest('hex').slice(0, 32)
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
      totalPlanCount: plans.length,
      allPlansCompleted: true,
      checkinMode: existing.checkinMode || (existing.autoCompleted === false ? 'MANUAL' : 'AUTO'),
      autoCompleted: existing.autoCompleted !== false,
      updatedAt: timestamp
    }
    if (existing.status === 'REVOKED') data.reactivatedAt = timestamp
    await db.collection(C.DAILY_REVIEWS).doc(existing._id).update({ data })
    return presentDailyReview({ ...existing, ...data })
  }
  const data = {
    userId,
    date,
    status: 'ACTIVE',
    mood: '',
    note: '',
    completedPlanCount: plans.length,
    totalPlanCount: plans.length,
    allPlansCompleted: true,
    checkinMode: 'AUTO',
    autoCompleted: true,
    checkedInAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const id = dailyReviewId(userId, date)
  await db.collection(C.DAILY_REVIEWS).doc(id).set({ data })
  return presentDailyReview({ _id: id, ...data })
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
      totalPlanCount,
      allPlansCompleted: completed,
      checkinMode: active ? (existing.checkinMode || (existing.autoCompleted === false ? 'MANUAL' : 'AUTO')) : 'MANUAL',
      autoCompleted: active ? existing.autoCompleted !== false : false,
      checkedInAt: existing.checkedInAt || timestamp,
      updatedAt: timestamp
    }
    if (!active) data.reactivatedAt = timestamp
    await db.collection(C.DAILY_REVIEWS).doc(existing._id).update({ data })
    return presentDailyReview({ ...existing, ...data })
  }
  const data = {
    userId,
    date,
    status: 'ACTIVE',
    mood: '',
    note: '',
    completedPlanCount,
    totalPlanCount,
    allPlansCompleted: completed,
    checkinMode: 'MANUAL',
    autoCompleted: false,
    checkedInAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const id = dailyReviewId(userId, date)
  await db.collection(C.DAILY_REVIEWS).doc(id).set({ data })
  return presentDailyReview({ _id: id, ...data })
}

async function dailyReviewStreak(userId, date) {
  const dates = []
  const pageSize = 100
  for (let offset = 0; offset < 3700; offset += pageSize) {
    const result = await db.collection(C.DAILY_REVIEWS)
      .where({ userId })
      .skip(offset)
      .limit(pageSize)
      .get()
    dates.push(...result.data.filter(item => item.status !== 'REVOKED' && item.date <= date).map(item => item.date))
    if (result.data.length < pageSize) break
  }
  return streakFromDates(dates, date)
}

async function revokeDailyReview(userId, date, planId) {
  const existing = await getDailyReview(userId, date)
  if (!existing || existing.status === 'REVOKED') return existing
  const plans = await getTodayPlans(userId, date)
  const completedPlanCount = plans.filter(plan => plan.completed).length
  const data = {
    completedPlanCount,
    totalPlanCount: plans.length,
    allPlansCompleted: plans.length > 0 && completedPlanCount === plans.length,
    lastIncompleteByPlanId: planId,
    updatedAt: now()
  }
  await db.collection(C.DAILY_REVIEWS).doc(existing._id).update({ data })
  return presentDailyReview({ ...existing, ...data })
}

module.exports = {
  getDailyReview,
  ensureDailyReviewAfterCompletion,
  createManualDailyReview,
  dailyReviewStreak,
  revokeDailyReview
}
