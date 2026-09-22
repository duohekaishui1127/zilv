const crypto = require('crypto')
const { cloud, db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { getUserById } = require('./users')
const { trimNotificationHistory } = require('./notification-retention')

function text(value, max = 20) { return String(value || '').trim().slice(0, max) }
function subscriptionType() {
  return String(process.env.PLAN_REMINDER_SUBSCRIPTION_TYPE || '').trim().toUpperCase() === 'LONG_TERM'
    ? 'LONG_TERM' : 'ONE_TIME'
}
function notificationId(goalId) {
  return crypto.createHash('sha256').update(`goal-achieved:${goalId}`).digest('hex').slice(0, 32)
}
function localTime(at, offsetMinutes) {
  const offset = Math.max(-720, Math.min(840, Number(offsetMinutes ?? 480)))
  const shifted = new Date(at.getTime() + offset * 60000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}
async function updateNotification(id, data) {
  await db.collection(C.NOTIFICATIONS).doc(id).update({ data:{ ...data,updatedAt:now() } })
}
async function clearGoalAuthorization(goalId) {
  await db.collection(C.PLANS).doc(goalId).update({ data:{ wechatReminderEnabled:false,updatedAt:now() } })
}
async function sendWechat(user, goal, notification, timestamp) {
  if (!goal.wechatReminderEnabled) {
    await updateNotification(notification._id,{ pushStatus:'NOT_SUBSCRIBED' })
    return 'internal-only'
  }
  const templateId=String(process.env.PLAN_REMINDER_TEMPLATE_ID || '').trim()
  if (!templateId) {
    await updateNotification(notification._id,{ pushStatus:'NOT_CONFIGURED' })
    return 'not-configured'
  }
  if (!user?.openid) {
    await updateNotification(notification._id,{ pushStatus:'FAILED',pushErrorCode:'USER_NOT_FOUND' })
    return 'failed'
  }
  const timeKey=process.env.REMINDER_TEMPLATE_TIME_KEY || 'time30'
  const contentKey=process.env.REMINDER_TEMPLATE_CONTENT_KEY || 'thing2'
  try {
    const result=await cloud.openapi.subscribeMessage.send({
      touser:user.openid,templateId,page:'pages/plan/index',
      miniprogramState:process.env.GOAL_REMINDER_MINIPROGRAM_STATE || process.env.SOCIAL_MINIPROGRAM_STATE || 'formal',lang:'zh_CN',
      data:{
        [timeKey]:{ value:localTime(timestamp,user.checkinReminderTimezoneOffset) },
        [contentKey]:{ value:text(`“${goal.name || '习惯'}”已达成`) }
      }
    })
    const code=Number(result.errCode ?? result.errcode ?? 0)
    if(code !== 0)throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'),result)
    await updateNotification(notification._id,{ pushStatus:'SENT',pushedAt:now() })
    if(subscriptionType() === 'ONE_TIME')await clearGoalAuthorization(goal._id)
    return 'sent'
  } catch(error) {
    const code=Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await updateNotification(notification._id,{
      pushStatus:code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED',pushErrorCode:code,
      pushErrorMessage:text(error?.errMsg || error?.message || '发送失败',120)
    })
    if(code === 43101)await clearGoalAuthorization(goal._id)
    return 'failed'
  }
}

async function notifyGoalAchieved(userId, goal, timestamp = now()) {
  if (goal.reminderEnabled === false) return 'disabled'
  const id=notificationId(goal._id)
  const existing=await db.collection(C.NOTIFICATIONS).doc(id).get().then(result => result.data).catch(() => null)
  if(existing)return 'duplicate'
  const content=goal.goalType === 'HABIT'
    ? `连续完成${goal.targetValue || goal.habitDays || 21}天，“${text(goal.name,30)}”已养成`
    : `长期目标“${text(goal.name,30)}”已达成`
  const notification={
    _id:id,userId,type:'GOAL_ACHIEVED',title:'长期目标已达成',content,
    page:'/pages/plan/index',goalId:goal._id,status:'UNREAD',pushStatus:'PENDING',
    createdAt:timestamp,updatedAt:timestamp
  }
  const { _id,...data }=notification
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
  await trimNotificationHistory(userId)
  const user=await getUserById(userId)
  if(!user) {
    await updateNotification(id,{ pushStatus:'FAILED',pushErrorCode:'USER_NOT_FOUND' })
    return 'failed'
  }
  return sendWechat(user,goal,notification,timestamp)
}

module.exports={ notificationId,notifyGoalAchieved }
