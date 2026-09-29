const { db,_,C } = require('../lib/db')
const { weekRange } = require('../lib/utils')
const { historicalPlans } = require('../domain/historical-plans')

async function rows(collection,where) {
  const result = []
  for (let offset = 0; ; offset += 100) {
    const page = await db.collection(collection).where(where).orderBy('_id','asc').skip(offset).limit(100).get()
    result.push(...page.data)
    if (page.data.length < 100) return result
  }
}
async function loadHistoricalPlans(userId,date) {
  const { startDate } = weekRange(date)
  const [plans,weeklyCheckins,reviews] = await Promise.all([
    rows(C.PLANS,{ userId }),rows(C.CHECKINS,{ userId,date:_.gte(startDate).and(_.lte(date)) }),
    db.collection(C.DAILY_REVIEWS).where({ userId,date }).limit(1).get()
  ])
  const checkins = weeklyCheckins.filter(item => item.date === date)
  const review = reviews.data.find(item => item.status !== 'REVOKED') || null
  return { ...historicalPlans(plans,checkins,review,date,weeklyCheckins),review,checkins }
}

module.exports = { loadHistoricalPlans }
