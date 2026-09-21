const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { isBasePlanDue } = require('../services/plans')
const { timerSnapshot, secondsOf } = require('../domain/plan-timer')

const COUNT_UP_REST_SECONDS = 2.5 * 60 * 60

async function acknowledgeCountUpRestReminder({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!plan.enabled || !isBasePlanDue(plan, localDate)) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')
  const result = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  const checkin = result.data[0]
  if (plan.timerMode !== 'COUNT_UP' || !checkin || checkin.timerStatus !== 'RUNNING') {
    throw fail('TIMER_NOT_RUNNING', '当前正计时未在运行')
  }
  if (checkin.timerRestReminderAt) return { acknowledged: true, remindedAt: checkin.timerRestReminderAt }
  const timestamp = now()
  const snapshot = timerSnapshot(checkin, plan, timestamp)
  if (secondsOf(snapshot.effectiveMs) < COUNT_UP_REST_SECONDS) throw fail('TIMER_REST_NOT_DUE', '尚未到休息提醒时间')
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data: { timerRestReminderAt: timestamp, updatedAt: timestamp } })
  return { acknowledged: true, remindedAt: timestamp }
}

module.exports = { acknowledgeCountUpRestReminder }
