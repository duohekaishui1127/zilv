const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const { checkinReminderContext, isPlanDue, weekRange, normalizeReminderSubscriptionType, localParts } = require('./reminder-rules')
const { expiredCountdownFields, countUpRestReminderDue } = require('./timer-rules')
const { deadlineReminderDue, reminderTimeReached } = require('./deadline-goal-rules')

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
  PLAN_GROUPS: 'plan_group_bindings',
  GROUP_PLAN_CHANGES: 'group_plan_change_requests'
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

function notificationId(userId, date) {
  return crypto.createHash('sha256').update(`checkin-reminder:${userId}:${date}`).digest('hex').slice(0, 32)
}

function timerNotificationId(checkinId) {
  return crypto.createHash('sha256').update(`timer-reminder:${checkinId}`).digest('hex').slice(0, 32)
}

function timerRestNotificationId(checkinId) {
  return crypto.createHash('sha256').update(`timer-rest-reminder:${checkinId}`).digest('hex').slice(0, 32)
}

function goalDeadlineNotificationId(goal, daysRemaining) {
  return crypto.createHash('sha256').update(`goal-deadline:${goal._id}:${goal.deadlineDate}:${daysRemaining}`).digest('hex').slice(0, 32)
}

function localTime(date = new Date()) {
  const rawOffset = Number(process.env.GROUP_TIMEZONE_OFFSET_MINUTES ?? 480)
  const offset = Number.isFinite(rawOffset) ? Math.min(840, Math.max(-720, rawOffset)) : 480
  const shifted = new Date(date.getTime() + offset * 60000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

async function document(collection, id) {
  try { return (await db.collection(collection).doc(id).get()).data } catch (error) { return null }
}

async function allMatches(collection, where) {
  const records = []
  while (true) {
    const result = await db.collection(collection).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if (result.data.length < 100) return records
  }
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

function templateData(user) {
  const timeKey = process.env.REMINDER_TEMPLATE_TIME_KEY || 'time30'
  const contentKey = process.env.REMINDER_TEMPLATE_CONTENT_KEY || 'thing2'
  return {
    [timeKey]: { value: user.checkinReminderTime },
    [contentKey]: { value: '今日任务未全部完成' }
  }
}

async function updateNotification(id, data) {
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).update({ data: { ...data, updatedAt: new Date() } })
}

async function clearOneTimeReminderForUser(userId) {
  await db.collection(COLLECTIONS.USERS).doc(userId).update({
    data:{ checkinReminderPushEnabled:false,updatedAt:new Date() }
  })
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

async function sendWechatReminder(user, notification) {
  const templateId = String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
  const subscriptionType = normalizeReminderSubscriptionType(process.env.PLAN_REMINDER_SUBSCRIPTION_TYPE)
  if (!user.checkinReminderPushEnabled) {
    await updateNotification(notification._id, { pushStatus: 'NOT_SUBSCRIBED' })
    return 'internal-only'
  }
  if (!templateId) {
    await updateNotification(notification._id, { pushStatus: 'NOT_CONFIGURED' })
    return 'not-configured'
  }
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
      data: templateData(user)
    })
    const resultCode = Number(result.errCode ?? result.errcode ?? 0)
    if (resultCode !== 0) throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'), result)
    await updateNotification(notification._id, { pushStatus: 'SENT', pushedAt: new Date() })
    if (subscriptionType === 'ONE_TIME') {
      await clearOneTimeReminderForUser(user._id)
    }
    return 'sent'
  } catch (error) {
    const code = Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await updateNotification(notification._id, {
      pushStatus: code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED',
      pushErrorCode: code,
      pushErrorMessage: text(error?.errMsg || error?.message || '发送失败', 120)
    })
    if (code === 43101) {
      await clearOneTimeReminderForUser(user._id)
    }
    return 'failed'
  }
}

async function sendTimerWechatReminder(user, checkin, plan, notification) {
  const templateId = String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
  if (!checkin.timerReminderPushEnabled) {
    await updateNotification(notification._id, { pushStatus: 'NOT_SUBSCRIBED' })
    return 'internal-only'
  }
  if (!templateId) {
    await updateNotification(notification._id, { pushStatus: 'NOT_CONFIGURED' })
    return 'not-configured'
  }
  if (!user?.openid) {
    await updateNotification(notification._id, { pushStatus: 'FAILED', pushErrorCode: 'USER_NOT_FOUND' })
    return 'failed'
  }
  const timeKey = process.env.REMINDER_TEMPLATE_TIME_KEY || 'time30'
  const contentKey = process.env.REMINDER_TEMPLATE_CONTENT_KEY || 'thing2'
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: user.openid,
      templateId,
      page: process.env.REMINDER_MESSAGE_PAGE || 'pages/today/index',
      miniprogramState: process.env.REMINDER_MINIPROGRAM_STATE || 'formal',
      lang: 'zh_CN',
      data: {
        [timeKey]: { value: localTime(notification.timerEndedAt) },
        [contentKey]: { value: text(notification.templateContent || `${plan.name || '任务'}计时提醒`) }
      }
    })
    const resultCode = Number(result.errCode ?? result.errcode ?? 0)
    if (resultCode !== 0) throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'), result)
    await updateNotification(notification._id, { pushStatus: 'SENT', pushedAt: new Date() })
    return 'sent'
  } catch (error) {
    const code = Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await updateNotification(notification._id, {
      pushStatus: code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED',
      pushErrorCode: code,
      pushErrorMessage: text(error?.errMsg || error?.message || '发送失败', 120)
    })
    return 'failed'
  }
}

async function sendGoalWechatReminder(user, goal, notification, at) {
  const templateId=String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
  const subscriptionType=normalizeReminderSubscriptionType(process.env.PLAN_REMINDER_SUBSCRIPTION_TYPE)
  if(!goal.wechatReminderEnabled) {
    await updateNotification(notification._id,{ pushStatus:'NOT_SUBSCRIBED' })
    return 'internal-only'
  }
  if(!templateId) {
    await updateNotification(notification._id,{ pushStatus:'NOT_CONFIGURED' })
    return 'not-configured'
  }
  if(!user?.openid) {
    await updateNotification(notification._id,{ pushStatus:'FAILED',pushErrorCode:'USER_NOT_FOUND' })
    return 'failed'
  }
  const timeKey=process.env.REMINDER_TEMPLATE_TIME_KEY || 'time30'
  const contentKey=process.env.REMINDER_TEMPLATE_CONTENT_KEY || 'thing2'
  const local=localParts(at,user.checkinReminderTimezoneOffset ?? 480)
  try {
    const result=await cloud.openapi.subscribeMessage.send({
      touser:user.openid,templateId,page:'pages/plan/index',
      miniprogramState:process.env.REMINDER_MINIPROGRAM_STATE || 'formal',lang:'zh_CN',
      data:{
        [timeKey]:{ value:local.time },
        [contentKey]:{ value:text(`“${goal.name || '目标'}”还有${notification.daysRemaining}天`) }
      }
    })
    const code=Number(result.errCode ?? result.errcode ?? 0)
    if(code !== 0)throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'),result)
    await updateNotification(notification._id,{ pushStatus:'SENT',pushedAt:new Date() })
    if(subscriptionType === 'ONE_TIME')await db.collection(COLLECTIONS.PLANS).doc(goal._id).update({ data:{ wechatReminderEnabled:false,updatedAt:new Date() } })
    return 'sent'
  } catch(error) {
    const code=Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await updateNotification(notification._id,{
      pushStatus:code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED',pushErrorCode:code,
      pushErrorMessage:text(error?.errMsg || error?.message || '发送失败',120)
    })
    if(code === 43101)await db.collection(COLLECTIONS.PLANS).doc(goal._id).update({ data:{ wechatReminderEnabled:false,updatedAt:new Date() } })
    return 'failed'
  }
}

async function processDeadlineGoal(goal, at) {
  const user=await document(COLLECTIONS.USERS,goal.userId)
  if(!user)return 'skipped'
  const local=localParts(at,user.checkinReminderTimezoneOffset ?? 480)
  if(!reminderTimeReached(local.time,process.env.GOAL_REMINDER_TIME || '09:00'))return 'skipped'
  const daysRemaining=deadlineReminderDue(goal,local.date)
  if(daysRemaining == null)return 'skipped'
  const id=goalDeadlineNotificationId(goal,daysRemaining)
  if(await document(COLLECTIONS.NOTIFICATIONS,id)) {
    await db.collection(COLLECTIONS.PLANS).doc(goal._id).update({ data:{
      deadlineReminderDaysSent:[...new Set([...(goal.deadlineReminderDaysSent || []),daysRemaining])],updatedAt:new Date()
    } })
    return 'duplicate'
  }
  const notification={
    _id:id,userId:goal.userId,type:'GOAL_DEADLINE_REMINDER',title:'长期目标倒计时',
    content:`距离“${text(goal.name,30)}”还有${daysRemaining}天`,page:'/pages/plan/index',
    goalId:goal._id,daysRemaining,recordDate:local.date,status:'UNREAD',pushStatus:'PENDING',createdAt:at,updatedAt:at
  }
  const { _id,...data }=notification
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).set({ data })
  await db.collection(COLLECTIONS.PLANS).doc(goal._id).update({ data:{
    deadlineReminderDaysSent:[...new Set([...(goal.deadlineReminderDaysSent || []),daysRemaining])],updatedAt:new Date()
  } })
  await trimNotificationHistory(goal.userId)
  return sendGoalWechatReminder(user,goal,notification,at)
}

async function processExpiredCountdown(checkin, at) {
  const latest = await document(COLLECTIONS.CHECKINS, checkin._id)
  const fields = expiredCountdownFields(latest, at)
  if (!fields) return 'skipped'

  const [plan, user] = await Promise.all([
    document(COLLECTIONS.PLANS, latest.planId),
    document(COLLECTIONS.USERS, latest.userId)
  ])
  await db.collection(COLLECTIONS.CHECKINS).doc(latest._id).update({ data: { ...fields, updatedAt: at } })
  if (!plan || !user) return 'skipped'

  const id = timerNotificationId(latest._id)
  if (await document(COLLECTIONS.NOTIFICATIONS, id)) return 'duplicate'
  const notification = {
    _id: id,
    userId: latest.userId,
    type: 'TIMER_REMINDER',
    title: '倒计时结束',
    content: `“${text(plan.name, 30)}”时间到了，完成后记得打卡`,
    page: '/pages/today/index',
    planId: latest.planId,
    checkinId: latest._id,
    timerEndedAt: fields.timerEndedAt,
    templateContent: `${plan.name || '任务'}倒计时已结束`,
    status: 'UNREAD',
    pushStatus: 'PENDING',
    createdAt: at,
    updatedAt: at
  }
  const { _id, ...notificationData } = notification
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).set({ data: notificationData })
  await trimNotificationHistory(latest.userId)
  return sendTimerWechatReminder(user, latest, plan, notification)
}

async function processCountUpRestReminder(checkin, at) {
  const latest = await document(COLLECTIONS.CHECKINS, checkin._id)
  if (!countUpRestReminderDue(latest, at)) return 'skipped'
  const [plan, user] = await Promise.all([
    document(COLLECTIONS.PLANS, latest.planId),
    document(COLLECTIONS.USERS, latest.userId)
  ])
  await db.collection(COLLECTIONS.CHECKINS).doc(latest._id).update({ data: {
    timerRestReminderAt: at,
    timerReminderPushEnabled: false,
    updatedAt: at
  } })
  if (!plan || !user) return 'skipped'

  const id = timerRestNotificationId(latest._id)
  if (await document(COLLECTIONS.NOTIFICATIONS, id)) return 'duplicate'
  const notification = {
    _id: id,
    userId: latest.userId,
    type: 'TIMER_REST_REMINDER',
    title: '休息提醒',
    content: `“${text(plan.name, 30)}”已专注一段时间，休息一下再继续吧`,
    templateContent: '专注了一段时间，休息一下吧',
    page: '/pages/today/index',
    planId: latest.planId,
    checkinId: latest._id,
    timerEndedAt: at,
    status: 'UNREAD',
    pushStatus: 'PENDING',
    createdAt: at,
    updatedAt: at
  }
  const { _id, ...notificationData } = notification
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).set({ data: notificationData })
  await trimNotificationHistory(latest.userId)
  return sendTimerWechatReminder(user, latest, plan, notification)
}

async function processUser(user, at) {
  const context = checkinReminderContext(user, at)
  if (!context) return 'skipped'
  const plans=(await allMatches(COLLECTIONS.PLANS,{ userId:user._id,enabled:true }))
    .filter(plan => !plan.deletedAt && isPlanDue(plan,context))
  if (!plans.length) return 'skipped'
  const completed=await Promise.all(plans.map(plan => alreadyCompleted(plan,context.date)))
  if (completed.every(Boolean)) return 'skipped'
  if (user.lastCheckinReminderNotificationDate === context.date) return 'duplicate'
  const id = notificationId(user._id, context.date)
  if (await document(COLLECTIONS.NOTIFICATIONS, id)) {
    await db.collection(COLLECTIONS.USERS).doc(user._id).update({ data: { lastCheckinReminderNotificationDate: context.date, updatedAt: new Date() } })
    return 'duplicate'
  }
  const timestamp = new Date()
  const notification = {
    _id: id,
    userId: user._id,
    type: 'CHECKIN_REMINDER',
    title: '今日打卡提醒',
    content: `今日任务完成 ${completed.filter(Boolean).length}/${plans.length}，尚未自动打卡`,
    page: '/pages/today/index',
    recordDate: context.date,
    reminderTime: user.checkinReminderTime,
    status: 'UNREAD',
    pushStatus: 'PENDING',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const { _id, ...notificationData } = notification
  await db.collection(COLLECTIONS.NOTIFICATIONS).doc(id).set({ data: notificationData })
  await db.collection(COLLECTIONS.USERS).doc(user._id).update({ data: { lastCheckinReminderNotificationDate: context.date, updatedAt: timestamp } })
  await trimNotificationHistory(user._id)
  return sendWechatReminder(user, notification)
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
    const changes=await db.collection(COLLECTIONS.GROUP_PLAN_CHANGES).where({ userId:member.userId,status:'PENDING' }).get()
    await Promise.all([
      ...bindings.data.map(binding => db.collection(COLLECTIONS.PLAN_GROUPS).doc(binding._id).update({ data:{ enabled:false,updatedAt:timestamp } })),
      ...changes.data.filter(item => item.groupIds?.includes(group._id)).map(item => db.collection(COLLECTIONS.GROUP_PLAN_CHANGES).doc(item._id).update({
        data:{ status:'REJECTED',rejectedGroupIds:[...(item.rejectedGroupIds || []),group._id],updatedAt:timestamp }
      }))
    ])
    removed++
  }
  await db.collection(COLLECTIONS.GROUPS).doc(group._id).update({ data:{ lastInactivitySweepDate:localDate,updatedAt:new Date() } })
  return removed
}

exports.main = async () => {
  const startedAt = new Date()
  const [users, groups, runningTimers, longTermGoals] = await Promise.all([
    allMatches(COLLECTIONS.USERS,{ checkinReminderEnabled:true }),
    allMatches(COLLECTIONS.GROUPS,{ autoRemoveInactiveDays:_.gt(0) }),
    allMatches(COLLECTIONS.CHECKINS,{ timerStatus:'RUNNING' }),
    allMatches(COLLECTIONS.PLANS,{ planType:'LONG_TERM' })
  ])
  const countdowns = runningTimers.filter(item => item.timerMode === 'COUNT_DOWN')
  const countUps = runningTimers.filter(item => item.timerMode === 'COUNT_UP')
  const summary = {
    scanned: users.length, sent: 0, internalOnly: 0, failed: 0, skipped: 0, duplicate: 0, autoRemoved: 0,
    timersScanned: runningTimers.length, timerSent: 0, timerInternalOnly: 0, timerFailed: 0, timerFinished: 0,
    restReminders: 0, goalsScanned:longTermGoals.length,goalSent:0,goalInternalOnly:0,goalFailed:0,goalDuplicate:0
  }
  for (const user of users) {
    const status = await processUser(user, startedAt)
    if (status === 'sent') summary.sent++
    else if (status === 'internal-only' || status === 'not-configured') summary.internalOnly++
    else if (status === 'failed') summary.failed++
    else if (status === 'duplicate') summary.duplicate++
    else summary.skipped++
  }
  for (const checkin of countdowns) {
    const status = await processExpiredCountdown(checkin, startedAt)
    if (status !== 'skipped') summary.timerFinished++
    if (status === 'sent') summary.timerSent++
    else if (status === 'internal-only' || status === 'not-configured') summary.timerInternalOnly++
    else if (status === 'failed') summary.timerFailed++
  }
  for (const checkin of countUps) {
    const status = await processCountUpRestReminder(checkin, startedAt)
    if (status !== 'skipped') summary.restReminders++
    if (status === 'sent') summary.timerSent++
    else if (status === 'internal-only' || status === 'not-configured') summary.timerInternalOnly++
    else if (status === 'failed') summary.timerFailed++
  }
  for(const goal of longTermGoals) {
    const status=await processDeadlineGoal(goal,startedAt)
    if(status === 'sent')summary.goalSent++
    else if(status === 'internal-only' || status === 'not-configured')summary.goalInternalOnly++
    else if(status === 'failed')summary.goalFailed++
    else if(status === 'duplicate')summary.goalDuplicate++
  }
  const localDate = dateOnly(startedAt)
  for (const group of groups) summary.autoRemoved += await enforceInactiveGroup(group, localDate)
  console.log('[reminder-dispatch]', JSON.stringify(summary))
  return { success: true, ...summary }
}
