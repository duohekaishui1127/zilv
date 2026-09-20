const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { notificationWindow, trimNotificationHistory } = require('../services/notification-retention')

function reminderTemplateId() {
  return String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
}

function reminderSubscriptionType() {
  return String(process.env.PLAN_REMINDER_SUBSCRIPTION_TYPE || '').trim().toUpperCase() === 'LONG_TERM'
    ? 'LONG_TERM' : 'ONE_TIME'
}

async function getReminderConfig() {
  const templateId = reminderTemplateId()
  return {
    configured: !!templateId,
    templateId,
    subscriptionType: reminderSubscriptionType()
  }
}

async function getNotifications({ user }) {
  return notificationWindow(user._id)
}

async function markNotificationRead({ user, event }) {
  const notificationId = String(event.notificationId || '').trim()
  if (!notificationId) throw fail('INVALID_PARAMETER', '消息标识不能为空')
  const notification = await db.collection(C.NOTIFICATIONS).doc(notificationId).get().then(x => x.data).catch(() => null)
  if (!notification || notification.userId !== user._id) throw fail('NOT_FOUND', '消息不存在')
  if (notification.status !== 'READ') {
    await db.collection(C.NOTIFICATIONS).doc(notification._id).update({ data: { status: 'READ', readAt: now(), updatedAt: now() } })
  }
  return { notification: { ...notification, status: 'READ' } }
}

async function markAllNotificationsRead({ user }) {
  await trimNotificationHistory(user._id)
  const timestamp = now()
  const result = await db.collection(C.NOTIFICATIONS).where({ userId: user._id, status: 'UNREAD' }).update({
    data: { status: 'READ', readAt: timestamp, updatedAt: timestamp }
  })
  return { updated: result.stats?.updated || 0 }
}

module.exports = { getReminderConfig, getNotifications, markNotificationRead, markAllNotificationsRead }
