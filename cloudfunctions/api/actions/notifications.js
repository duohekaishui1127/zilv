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

function checkinReminderSettings(user) {
  return {
    enabled:Boolean(user.checkinReminderEnabled),
    time:user.checkinReminderTime || '21:00',
    timezoneOffset:Number.isFinite(Number(user.checkinReminderTimezoneOffset)) ? Number(user.checkinReminderTimezoneOffset) : 480,
    pushEnabled:Boolean(user.checkinReminderPushEnabled)
  }
}

async function getCheckinReminderSettings({ user }) {
  return { ...checkinReminderSettings(user),...(await getReminderConfig()) }
}

async function updateCheckinReminderSettings({ user,event }) {
  const enabled=Boolean(event.enabled)
  const time=String(event.time || user.checkinReminderTime || '21:00')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail('INVALID_PARAMETER','提醒时间不合法')
  const timezoneOffset=Number(event.timezoneOffset ?? user.checkinReminderTimezoneOffset ?? 480)
  if (!Number.isFinite(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) throw fail('INVALID_PARAMETER','提醒时区不合法')
  const pushEnabled=enabled && (event.grantAccepted === true || Boolean(user.checkinReminderPushEnabled))
  const data={
    checkinReminderEnabled:enabled,checkinReminderTime:time,
    checkinReminderTimezoneOffset:Math.round(timezoneOffset),checkinReminderPushEnabled:pushEnabled,
    updatedAt:now()
  }
  await db.collection(C.USERS).doc(user._id).update({ data })
  return { ...checkinReminderSettings({ ...user,...data }),...(await getReminderConfig()) }
}

async function renewCheckinReminderSubscription({ user, event, localDate }) {
  if (event.authorized !== true) throw fail('REMINDER_AUTH_REQUIRED', '请先允许微信订阅提醒')
  if (!user.checkinReminderEnabled) return { renewed:false,alreadyRenewed:false }
  if (user.lastReminderRenewalDate === localDate) return { renewed:false,alreadyRenewed:true,count:0 }
  const timestamp = now()
  await db.collection(C.USERS).doc(user._id).update({
    data:{ checkinReminderPushEnabled:true,lastReminderRenewalDate:localDate,updatedAt:timestamp }
  })
  return { renewed:true,alreadyRenewed:false }
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

module.exports = {
  getReminderConfig,getCheckinReminderSettings,updateCheckinReminderSettings,renewCheckinReminderSubscription,
  getNotifications, markNotificationRead, markAllNotificationsRead
}
