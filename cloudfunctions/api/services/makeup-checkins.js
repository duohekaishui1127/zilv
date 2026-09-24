const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { getTodayPlans } = require('./plans')
const { getDailyReview } = require('./daily-reviews')
const { presentDailyReview } = require('../domain/daily-review')
const { INITIAL_GRANT_VERSION, todayForUser, previousDate, makeupCardState } = require('../domain/makeup-cards')
const { syncPlanCategoryRecord } = require('./plan-records')
const { syncLongTermGoalAchievements } = require('./long-term-goals')

const MOODS = new Set(['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD'])

function reviewId(userId, date) {
  return crypto.createHash('sha256').update(`daily-review:${userId}:${date}`).digest('hex').slice(0, 32)
}

function checkinId(userId, planId, date) {
  return crypto.createHash('sha256').update(`makeup-checkin:${userId}:${planId}:${date}`).digest('hex').slice(0, 32)
}

async function txDocument(transaction, collection, id) {
  try { return (await transaction.collection(collection).doc(id).get()).data || null } catch (error) {
    if (/not exist|not found|不存在/i.test(String(error?.message || error?.errMsg || ''))) return null
    throw error
  }
}

async function getMakeupCardStatus(user) {
  const today = todayForUser(user)
  const month = today.slice(0, 7)
  if (user.makeupCardGrantMonth === month && user.makeupCardInitialGrantVersion === INITIAL_GRANT_VERSION) {
    return { ...makeupCardState(user, today), yesterday: previousDate(today) }
  }
  const outcome = await db.runTransaction(async transaction => {
    const current = await txDocument(transaction, C.USERS, user._id)
    if (!current) throw fail('UNAUTHORIZED', '用户不存在')
    const currentToday = todayForUser(current)
    const cards = makeupCardState(current, currentToday)
    if (current.makeupCardGrantMonth !== cards.grantMonth || current.makeupCardInitialGrantVersion !== INITIAL_GRANT_VERSION) {
      await transaction.collection(C.USERS).doc(user._id).update({ data: {
        makeupCardBalance: cards.balance, makeupCardGrantMonth: cards.grantMonth,
        makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION, updatedAt: now()
      } })
    }
    return { ...cards, yesterday: previousDate(currentToday) }
  })
  return outcome?.result || outcome
}

async function makeupDailyCheckin({ user, event }) {
  const timestamp = now()
  const today = todayForUser(user, timestamp)
  const date = String(event.makeupDate || '')
  if (date !== previousDate(today)) throw fail('MAKEUP_DATE_INVALID', '只能补签昨天，前天及更早日期不能补签')
  const ids = event.completedPlanIds
  if (!Array.isArray(ids) || ids.length > 40 || ids.some(id => typeof id !== 'string')) {
    throw fail('INVALID_PARAMETER', '请选择需要补签的任务')
  }
  const selectedIds = [...new Set(ids)]
  const mood = String(event.mood || '')
  if (mood && !MOODS.has(mood)) throw fail('INVALID_PARAMETER', '心情选项不合法')
  const note = String(event.note || '').trim().slice(0, 1000)
  const plans = await getTodayPlans(user._id, date)
  const planMap = new Map(plans.map(plan => [plan._id, plan]))
  if (selectedIds.some(id => !planMap.has(id))) throw fail('PLAN_NOT_DUE', '只能补签昨天应执行的任务')
  const existingReview = await getDailyReview(user._id, date)
  if (existingReview && existingReview.status !== 'REVOKED') throw fail('ALREADY_CHECKED_IN', '昨天已经打卡，无需消耗补签卡')
  const id = existingReview?._id || reviewId(user._id, date)
  const result = await db.runTransaction(async transaction => {
    const currentUser = await txDocument(transaction, C.USERS, user._id)
    if (!currentUser) throw fail('UNAUTHORIZED', '用户不存在')
    const currentToday = todayForUser(currentUser, now())
    if (date !== previousDate(currentToday)) throw fail('MAKEUP_DATE_INVALID', '补签时间已过，只能补签昨天')
    const cards = makeupCardState(currentUser, currentToday)
    if (cards.balance < 1) throw fail('NO_MAKEUP_CARD', '补签卡不足，下月会自动获得一张')
    const currentReview = await txDocument(transaction, C.DAILY_REVIEWS, id)
    if (currentReview && currentReview.status !== 'REVOKED') throw fail('ALREADY_CHECKED_IN', '昨天已经打卡，无需重复扣卡')
    const completed = []
    for (const planId of selectedIds) {
      const plan = planMap.get(planId)
      const existingId = plan.checkin?._id || checkinId(user._id, planId, date)
      const checkin = await txDocument(transaction, C.CHECKINS, existingId)
      if (checkin && (checkin.userId !== user._id || checkin.planId !== planId || checkin.date !== date)) {
        throw fail('INVALID_PARAMETER', '任务记录不匹配')
      }
      if (checkin?.completed) continue
      if (['RUNNING', 'PAUSED'].includes(checkin?.timerStatus)) {
        throw fail('TIMER_ACTIVE', '请先结束昨天仍在运行的计时')
      }
      const actualValue = Number(plan.targetValue ?? 1)
      const data = {
        userId: user._id, planId, date, completed: true,
        actualValue: Number.isFinite(actualValue) ? actualValue : 1,
        durationMinutes: checkin?.durationMinutes ?? (plan.targetType === 'DURATION' ? actualValue : null),
        completedAt: timestamp, makeupAt: timestamp, completionSource: 'MAKEUP',
        completionVersion: Number(checkin?.completionVersion || 0) + 1,
        revokedAt: null, updatedAt: timestamp
      }
      if (checkin) await transaction.collection(C.CHECKINS).doc(existingId).update({ data })
      else await transaction.collection(C.CHECKINS).doc(existingId).set({ data: { ...data, createdAt: timestamp } })
      completed.push({ plan, checkin: { _id: existingId, ...(checkin || {}), ...data } })
    }
    const completedCount = plans.filter(plan => plan.completed || selectedIds.includes(plan._id)).length
    const reviewData = {
      userId: user._id, date, status: 'ACTIVE', mood, note,
      completedPlanCount: completedCount, totalPlanCount: plans.length,
      allPlansCompleted: plans.length > 0 && completedCount === plans.length,
      checkinMode: 'MAKEUP', autoCompleted: false, checkedInAt: timestamp,
      makeupAt: timestamp, makeupCardSpent: 1, revokedAt: null, updatedAt: timestamp
    }
    if (currentReview) await transaction.collection(C.DAILY_REVIEWS).doc(id).update({ data: reviewData })
    else await transaction.collection(C.DAILY_REVIEWS).doc(id).set({ data: { ...reviewData, createdAt: timestamp } })
    const balance = cards.balance - 1
    await transaction.collection(C.USERS).doc(user._id).update({ data: {
      makeupCardBalance: balance, makeupCardGrantMonth: cards.grantMonth,
      makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION, updatedAt: timestamp
    } })
    return { review: presentDailyReview({ _id: id, ...(currentReview || {}), ...reviewData }), balance, completed }
  })
  const saved = result?.result || result
  for (const item of saved.completed) {
    await syncPlanCategoryRecord({ user, plan: item.plan, checkin: item.checkin, localDate: date })
      .catch(error => console.warn('[makeup-category-record]', error?.message || error))
  }
  if (saved.completed.length) {
    await syncLongTermGoalAchievements(user._id, today, { allowReopen: true })
      .catch(error => console.warn('[makeup-goal-sync]', error?.message || error))
  }
  return { review: saved.review, balance: saved.balance, completedCount: saved.completed.length }
}

module.exports = { makeupDailyCheckin, getMakeupCardStatus }
