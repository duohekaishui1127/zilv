const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { createManualDailyReview, dailyReviewStreak } = require('../services/daily-reviews')
const { presentDailyReview } = require('../domain/daily-review')

const MOODS = ['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD']

async function saveDailyReview({ user, event, localDate }) {
  const mood = String(event.mood || '')
  if (!MOODS.includes(mood)) throw fail('INVALID_PARAMETER', '请选择今天的心情')
  const result = await db.collection(C.DAILY_REVIEWS).where({ userId: user._id, date: localDate }).limit(1).get()
  if (!result.data.length || result.data[0].status === 'REVOKED') throw fail('DAILY_REVIEW_NOT_FOUND', '请先完成自动打卡或点击打卡')
  const timestamp = now()
  const data = {
    mood,
    note: String(event.note || '').trim().slice(0, 1000),
    updatedAt: timestamp
  }
  await db.collection(C.DAILY_REVIEWS).doc(result.data[0]._id).update({ data })
  const review = presentDailyReview({ ...result.data[0], ...data })
  return { review }
}

async function manualDailyCheckin({ user, localDate }) {
  const review = await createManualDailyReview(user._id, localDate)
  const currentStreak = await dailyReviewStreak(user._id, localDate)
  return { review, currentStreak }
}

module.exports = { saveDailyReview, manualDailyCheckin }
