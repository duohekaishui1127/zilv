const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const { reminderContext, weekRange } = require('./reminder-rules')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTIONS = Object.freeze({
  USERS: 'users',
  PLANS: 'plans',
  CHECKINS: 'checkins',
  NOTIFICATIONS: 'notifications',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  PLAN_GROUPS: 'plan_group_bindings'
})
const NOTIFICATION_LIMIT = 20

function text(value, max = 20) { return String(value || '').trim().slice(0, max) }

function dateOnly(date = new Date()) {
  const rawOffset = Number(process.env.GROUP_TIMEZONE_OFFSET_MINUTES ?? 480)
  const offset = Number.isFinite(rawOffset) ? Math.min(840, Math.max(-720, rawOffset)) : 480
  const shifted = new Date(date.getTime() + offset * 60000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ''))) return 0
  return Math.max(0, Math.floor((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000))
}

function joinedDateOf(member, fallback) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(member.joinedDate || ''))) return member.joinedDate
  const joinedAt = new Date(member.joinedAt || '')
  return Number.isNaN(joinedAt.getTime()) ? fallback : dateOnly(joinedAt)
}

function notificationId(userId, planId, date) {
  return crypto.createHash('sha256').update(`${userId}:${planId}:${date}`).digest('hex').slice(0, 32)
}

async function document(collection, id) {
  try { return (await db.collection(collection).doc(id).get()).data } catch (error) { return null }
}

async function alreadyCompleted(plan, date) {
  const today = await db.collection(COLLECTIONS.CHECKINS).where({
    userId: plan.userId, planId: plan._id, date, completed: true
  }).limit(1).get()
  if (today.data.length) return true
  if (plan.repeatType !== 'WEEKLY_COUNT') return false
  const { startDate, endDate } = weekRange(date)
  const count = await db.collection(COLLECTIONS.CHECKINS).where({
    userId: plan.userId,
    planId: plan._id,
    date: _.gte(startDate).and(_.lte(endDate)),
    completed: true
  }).count()
  return count.total >= Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)
}

function templateData(plan, context) {
  const planKey = process.env.REMINDER_TEMPLATE_PLAN_KEY || 'thing1'
  const timeKey = process.env.REMINDER_TEMPLATE_TIME_KEY || 'time2'
  const statusKey = process.env.REMINDER_TEMPLATE_STATUS_KEY || 'thing3'
  return {
    [planKey]: { value: text(plan.name, 20) },
    [timeKey]: { value: `${context.date} ${plan.reminderTime}` },
    [statusKey]: { value: '今日尚未打卡' }
  }
}

async function updateNotification(id, data) {
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).update({ data: { ...data, updatedAt: new Date() } })
}

async function trimNotificationHistory(userId) {
  while (true) {
    const overflow = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .skip(NOTIFICATION_LIMIT)
      .limit(100)
      .get()
    if (!overflow.data.length) return
    await Promise.all(overflow.data.map(item => db.collection(COLLECTIONS.NOTIFICATIONS).doc(item._id).remove()))
  }
}

async function sendWechatReminder(plan, context, notification) {
  const templateId = String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
  if (!plan.reminderPushEnabled) {
    await updateNotification(notification._id, { pushStatus: 'NOT_SUBSCRIBED' })
    return 'internal-only'
  }
  if (!templateId) {
    await updateNotification(notification._id, { pushStatus: 'NOT_CONFIGURED' })
    return 'not-configured'
  }
  const user = await document(COLLECTIONS.USERS, plan.userId)
  if (!user?.openid) {
    await updateNotification(notification._id, { pushStatus: 'FAILED', pushErrorCode: 'USER_NOT_FOUND' })
    return 'failed'
  }
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: user.openid,
      templateId,
      page: process.env.REMINDER_MESSAGE_PAGE || 'pages/today/index',
      miniprogramState: process.env.REMINDER_MINIPROGRAM_STATE || 'formal',
      lang: 'zh_CN',
      data: templateData(plan, context)
    })
    const resultCode = Number(result.errCode ?? result.errcode ?? 0)
    if (resultCode !== 0) throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'), result)
    await updateNotification(notification._id, { pushStatus: 'SENT', pushedAt: new Date() })
    await db.collection(COLLECTIONS.PLANS).doc(plan._id).update({ data: { reminderPushEnabled: false, updatedAt: new Date() } })
    return 'sent'
  } catch (error) {
    const code = Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await updateNotification(notification._id, {
      pushStatus: code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED',
      pushErrorCode: code,
      pushErrorMessage: text(error?.errMsg || error?.message || '发送失败', 120)
    })
    if (code === 43101) {
      await db.collection(COLLECTIONS.PLANS).doc(plan._id).update({ data: { reminderPushEnabled: false, updatedAt: new Date() } })
    }
    return 'failed'
  }
}

async function processPlan(plan, at) {
  const context = reminderContext(plan, at)
  if (!context || await alreadyCompleted(plan, context.date)) return 'skipped'
  if (plan.lastReminderNotificationDate === context.date) return 'duplicate'
  const id = notificationId(plan.userId, plan._id, context.date)
  if (await document(COLLECTIONS.NOTIFICATIONS, id)) {
    await db.collection(COLLECTIONS.PLANS).doc(plan._id).update({ data: { lastReminderNotificationDate: context.date, updatedAt: new Date() } })
    return 'duplicate'
  }
  const timestamp = new Date()
  const notification = {
    _id: id,
    userId: plan.userId,
    type: 'PLAN_REMINDER',
    title: '待打卡提醒',
    content: `“${text(plan.name, 60)}”今天还没有打卡`,
    planId: plan._id,
    recordDate: context.date,
    reminderTime: plan.reminderTime,
    status: 'UNREAD',
    pushStatus: 'PENDING',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const { _id, ...notificationData } = notification
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).set({ data: notificationData })
  await db.collection(COLLECTIONS.PLANS).doc(plan._id).update({ data: { lastReminderNotificationDate: context.date, updatedAt: timestamp } })
  await trimNotificationHistory(plan.userId)
  return sendWechatReminder(plan, context, notification)
}

async function enforceInactiveGroup(group, localDate) {
  const threshold = Math.min(365, Math.max(0, Math.round(Number(group.autoRemoveInactiveDays || 0))))
  if (!threshold || group.lastInactivitySweepDate === localDate) return 0
  const members = await db.collection(COLLECTIONS.GROUP_MEMBERS).where({ groupId:group._id,status:'ACTIVE' }).get()
  let removed = 0
  for (const member of members.data) {
    if (member.role === 'OWNER') continue
    const bindings = await db.collection(COLLECTIONS.PLAN_GROUPS).where({ groupId:group._id,userId:member.userId,enabled:true }).get()
    const planIds = new Set(bindings.data.map(item => item.planId))
    const joinedDate = joinedDateOf(member, localDate)
    let lastDate = ''
    if (planIds.size) {
      const result = await db.collection(COLLECTIONS.CHECKINS).where({
        userId:member.userId,completed:true,date:_.gte(joinedDate).and(_.lte(localDate))
      }).get()
      const dates = result.data.filter(item => planIds.has(item.planId)).map(item => item.date).sort()
      lastDate = dates[dates.length - 1] || ''
    }
    if (daysBetween(lastDate || joinedDate, localDate) < threshold) continue
    const timestamp = new Date()
    await db.collection(COLLECTIONS.GROUP_MEMBERS).doc(member._id).update({ data:{
      status:'AUTO_REMOVED',autoRemovedAt:timestamp,autoRemovedDate:localDate,
      removalReason:`连续${threshold}天未完成群组打卡`,updatedAt:timestamp
    } })
    await Promise.all(bindings.data.map(binding => db.collection(COLLECTIONS.PLAN_GROUPS).doc(binding._id).update({
      data:{ enabled:false,updatedAt:timestamp }
    })))
    removed++
  }
  await db.collection(COLLECTIONS.GROUPS).doc(group._id).update({ data:{ lastInactivitySweepDate:localDate,updatedAt:new Date() } })
  return removed
}

exports.main = async () => {
  const startedAt = new Date()
  const [result, groups] = await Promise.all([
    db.collection(COLLECTIONS.PLANS).where({ enabled: true, reminderEnabled: true }).limit(100).get(),
    db.collection(COLLECTIONS.GROUPS).where({ autoRemoveInactiveDays:_.gt(0) }).limit(100).get()
  ])
  const summary = { scanned: result.data.length, sent: 0, internalOnly: 0, failed: 0, skipped: 0, duplicate: 0,autoRemoved:0 }
  for (const plan of result.data) {
    const status = await processPlan(plan, startedAt)
    if (status === 'sent') summary.sent++
    else if (status === 'internal-only' || status === 'not-configured') summary.internalOnly++
    else if (status === 'failed') summary.failed++
    else if (status === 'duplicate') summary.duplicate++
    else summary.skipped++
  }
  const localDate = dateOnly(startedAt)
  for (const group of groups.data) summary.autoRemoved += await enforceInactiveGroup(group, localDate)
  console.log('[reminder-dispatch]', JSON.stringify(summary))
  return { success: true, ...summary }
}
