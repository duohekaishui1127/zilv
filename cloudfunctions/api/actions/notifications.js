const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')

function reminderTemplateId() {
  return String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
}

async function getReminderConfig() {
  const templateId = reminderTemplateId()
  return {
    configured: !!templateId,
    templateId,
    subscriptionType: 'ONE_TIME'
  }
}

async function getNotifications({ user, event }) {
  const limit = Math.min(Math.max(Number(event.limit || 50), 1), 100)
  const [result, unread] = await Promise.all([
    db.collection(C.NOTIFICATIONS).where({ userId: user._id }).orderBy('createdAt', 'desc').limit(limit).get(),
    db.collection(C.NOTIFICATIONS).where({ userId: user._id, status: 'UNREAD' }).count()
  ])
  return { notifications: result.data, unreadCount: unread.total }
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
  const timestamp = now()
  const result = await db.collection(C.NOTIFICATIONS).where({ userId: user._id, status: 'UNREAD' }).update({
    data: { status: 'READ', readAt: timestamp, updatedAt: timestamp }
  })
  return { updated: result.stats?.updated || 0 }
}

module.exports = { getReminderConfig, getNotifications, markNotificationRead, markAllNotificationsRead }
