const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')

const MOODS = ['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD']

async function saveDailyReview({ user, event, localDate }) {
  const mood = String(event.mood || '')
  if (!MOODS.includes(mood)) throw fail('INVALID_PARAMETER', '请选择今天的心情')
  const result = await db.collection(C.DAILY_REVIEWS).where({ userId: user._id, date: localDate }).limit(1).get()
  if (!result.data.length || result.data[0].status === 'REVOKED') throw fail('DAILY_REVIEW_NOT_FOUND', '完成今日全部计划后才可以记录心情')
  const timestamp = now()
  const data = {
    mood,
    note: String(event.note || '').trim().slice(0, 1000),
    updatedAt: timestamp
  }
  await db.collection(C.DAILY_REVIEWS).doc(result.data[0]._id).update({ data })
  const review = { ...result.data[0], ...data }
  return { review }
}

module.exports = { saveDailyReview }
