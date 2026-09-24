const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { trimNotificationHistory } = require('./notification-retention')

function timerNotificationId(checkinId) {
  return crypto.createHash('sha256').update(`timer-reminder:${checkinId}`).digest('hex').slice(0, 32)
}

async function recordCountdownFinished(plan, checkin, endedAt) {
  const id = timerNotificationId(checkin._id)
  const existing = await db.collection(C.NOTIFICATIONS).doc(id).get().then(result => result.data).catch(() => null)
  if (existing) return existing
  const timestamp = new Date()
  const data = {
    userId: checkin.userId,
    type: 'TIMER_REMINDER',
    title: '倒计时结束',
    content: `“${String(plan.name || '任务').slice(0, 30)}”时间到了，完成后记得打卡`,
    page: '/pages/today/index',
    planId: plan._id,
    checkinId: checkin._id,
    timerEndedAt: endedAt,
    templateContent: `${String(plan.name || '任务').slice(0, 12)}倒计时已结束`,
    pushAuthorized: Boolean(checkin.timerReminderPushEnabled),
    status: 'UNREAD',
    pushStatus: checkin.timerReminderPushEnabled ? 'PENDING' : 'IN_APP_ONLY',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
  await trimNotificationHistory(checkin.userId)
  return { _id: id, ...data }
}

function timerRestNotificationId(checkinId) {
  return crypto.createHash('sha256').update(`timer-rest-reminder:${checkinId}`).digest('hex').slice(0, 32)
}

async function recordCountUpRestReminder(plan, checkin, remindedAt) {
  const id = timerRestNotificationId(checkin._id)
  const existing = await db.collection(C.NOTIFICATIONS).doc(id).get().then(result => result.data).catch(() => null)
  if (existing) return existing
  const data = {
    userId: checkin.userId,
    type: 'TIMER_REST_REMINDER',
    title: '休息提醒',
    content: `“${String(plan.name || '任务').slice(0, 30)}”已专注一段时间，休息一下再继续吧`,
    templateContent: '专注了一段时间，休息一下吧',
    page: '/pages/today/index',
    planId: plan._id,
    checkinId: checkin._id,
    timerEndedAt: remindedAt,
    pushAuthorized: Boolean(checkin.timerReminderPushEnabled),
    status: 'UNREAD',
    pushStatus: checkin.timerReminderPushEnabled ? 'PENDING' : 'IN_APP_ONLY',
    createdAt: remindedAt,
    updatedAt: remindedAt
  }
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
  await trimNotificationHistory(checkin.userId)
  return { _id: id, ...data }
}

module.exports = { recordCountdownFinished, recordCountUpRestReminder }
