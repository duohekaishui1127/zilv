const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { trimNotificationHistory } = require('./notification-retention')

function text(value, max = 20) { return String(value || '').trim().slice(0, max) }
function notificationId(goalId) {
  return crypto.createHash('sha256').update(`goal-achieved:${goalId}`).digest('hex').slice(0, 32)
}

async function notifyGoalAchieved(userId, goal, timestamp = now()) {
  const id=notificationId(goal._id)
  const existing=await db.collection(C.NOTIFICATIONS).doc(id).get().then(result => result.data).catch(() => null)
  if(existing)return 'duplicate'
  const content=goal.goalType === 'HABIT'
    ? `连续完成${goal.targetValue || goal.habitDays || 21}天，“${text(goal.name,30)}”已养成`
    : `长期目标“${text(goal.name,30)}”已达成`
  const notification={
    _id:id,userId,type:'GOAL_ACHIEVED',title:'长期目标已达成',content,
    page:'/pages/plan/index',goalId:goal._id,status:'UNREAD',pushStatus:'IN_APP_ONLY',
    createdAt:timestamp,updatedAt:timestamp
  }
  const { _id,...data }=notification
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
  await trimNotificationHistory(userId)
  return 'internal-only'
}

module.exports={ notificationId,notifyGoalAchieved }
