const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { revokePlanCategoryRecord } = require('../services/plan-records')
const { revokeDailyReview } = require('../services/daily-reviews')
const { emitGroupEventsForRevocation } = require('../services/social')

async function revokePlanCompletion({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const result = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  const checkin = result.data[0]
  if (!checkin?.completed) return { revoked: false }
  const data = { completed: false, revokedAt: now(), updatedAt: now() }
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data })
  const revokedCheckin = { ...checkin, ...data }
  await revokePlanCategoryRecord({ user, plan, localDate })
  await revokeDailyReview(user._id, localDate, plan._id)
  await emitGroupEventsForRevocation(user, plan, revokedCheckin).catch(error => {
    console.warn('[social-revoke]', error?.message || error)
  })
  return { revoked: true, checkin: revokedCheckin }
}

module.exports = { revokePlanCompletion }
