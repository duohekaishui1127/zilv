const { db, _, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { isBasePlanDue } = require('./plans')

async function activeCheckins(userId) {
  const result = await db.collection(C.CHECKINS)
    .where({ userId, timerStatus: _.in(['RUNNING', 'PAUSED']) })
    .limit(100).get()
  return result.data.sort((a, b) => new Date(a.timerStartedAt || a.createdAt || 0) - new Date(b.timerStartedAt || b.createdAt || 0))
}

function timerPayload(checkin, plan) {
  return { planId: plan._id, planName: plan.name, checkinId: checkin._id,
    date: checkin.date, mode: checkin.timerMode, status: checkin.timerStatus, checkin }
}

async function getActiveTimer({ user, localDate }) {
  const serverTime = now()
  const active = await activeCheckins(user._id)
  for (const checkin of active) {
    const plan = await db.collection(C.PLANS).doc(checkin.planId).get().then(result => result.data).catch(() => null)
    if (plan && plan.userId === user._id) return { timer: timerPayload(checkin, plan), serverTime }
  }
  const previous = new Date(`${localDate}T12:00:00`)
  previous.setDate(previous.getDate() - 7)
  const earliestDate = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`
  const pending = await db.collection(C.CHECKINS).where({
    userId: user._id, timerStatus: 'FINISHED', completed: false,
    date: _.gte(earliestDate).and(_.lt(localDate))
  }).limit(100).get()
  const newest = pending.data.sort((a, b) => new Date(b.timerEndedAt || 0) - new Date(a.timerEndedAt || 0))
  for (const checkin of newest) {
    const plan = await db.collection(C.PLANS).doc(checkin.planId).get().then(result => result.data).catch(() => null)
    if (plan && plan.userId === user._id && !plan.deletedAt) return { timer: timerPayload(checkin, plan), serverTime }
  }
  return { timer: null, serverTime }
}

async function timerContext(user, event, localDate) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  let checkin = null
  if (event.checkinId) {
    checkin = await db.collection(C.CHECKINS).doc(event.checkinId).get().then(x => x.data).catch(() => null)
    if (!checkin || checkin.userId !== user._id || checkin.planId !== plan._id || !['RUNNING', 'PAUSED', 'FINISHED'].includes(checkin.timerStatus)) {
      throw fail('TIMER_NOT_FOUND', '计时记录不存在')
    }
  } else {
    const result = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
    checkin = result.data[0] || null
  }
  if (!plan.enabled && !checkin) throw fail('PLAN_DISABLED', '计划已停用')
  if (!checkin && !isBasePlanDue(plan, localDate)) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')
  return { plan, checkin }
}

module.exports = { activeCheckins, getActiveTimer, timerContext }
