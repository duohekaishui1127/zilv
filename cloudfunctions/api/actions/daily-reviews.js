const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { getTodayPlans } = require('../services/plans')

const MOODS = ['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD']

async function saveDailyReview({ user, event, localDate }) {
  const mood = String(event.mood || '')
  if (!MOODS.includes(mood)) throw fail('INVALID_PARAMETER', '请选择今天的心情')
  const result = await db.collection(C.DAILY_REVIEWS).where({ userId: user._id, date: localDate }).limit(1).get()
  const plans = await getTodayPlans(user._id, localDate)
  const completedPlanCount = plans.filter(plan => plan.completed).length
  if (!result.data.length && completedPlanCount < plans.length) throw fail('DAILY_PLANS_INCOMPLETE', '完成今日全部计划后才可以打卡')
  const timestamp = now()
  const data = {
    mood,
    note: String(event.note || '').trim().slice(0, 1000),
    completedPlanCount,
    totalPlanCount: plans.length,
    checkedInAt: result.data[0]?.checkedInAt || timestamp,
    updatedAt: timestamp
  }
  let review
  if (result.data.length) {
    await db.collection(C.DAILY_REVIEWS).doc(result.data[0]._id).update({ data })
    review = { ...result.data[0], ...data }
  } else {
    const base = { userId: user._id, date: localDate, ...data, createdAt: timestamp }
    const added = await db.collection(C.DAILY_REVIEWS).add({ data: base })
    review = { _id: added._id, ...base }
  }
  return { review }
}

module.exports = { saveDailyReview }
