const { now, fail } = require('../lib/utils')
const { timerSnapshot, secondsOf } = require('../domain/plan-timer')
const { timerContext } = require('../services/active-timers')
const { recordCountUpRestReminder } = require('../services/timer-notifications')
const { db, C } = require('../lib/db')

const COUNT_UP_REST_SECONDS = 2.5 * 60 * 60

async function acknowledgeCountUpRestReminder({ user, event, localDate }) {
  const { plan, checkin } = await timerContext(user, event, localDate)
  if (checkin?.timerMode !== 'COUNT_UP' || checkin.timerStatus !== 'RUNNING') {
    throw fail('TIMER_NOT_RUNNING', '当前正计时未在运行')
  }
  if (checkin.timerRestReminderAt) return { acknowledged: true, newlyReminded: false, remindedAt: checkin.timerRestReminderAt }
  const timestamp = now()
  const snapshot = timerSnapshot(checkin, plan, timestamp)
  if (secondsOf(snapshot.effectiveMs) < COUNT_UP_REST_SECONDS) throw fail('TIMER_REST_NOT_DUE', '尚未到休息提醒时间')
  await recordCountUpRestReminder(plan, checkin, timestamp)
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data: {
    timerRestReminderAt: timestamp, timerReminderPushEnabled: false, updatedAt: timestamp
  } })
  return { acknowledged: true, newlyReminded: true, remindedAt: timestamp }
}

module.exports = { acknowledgeCountUpRestReminder }
