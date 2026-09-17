const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')

const MUTATING_ACTIONS = new Set([
  'updateProfile','addBodyRecord','createCustomFood','addMealItem','addMealEntry','deleteMealItem','deleteMealEntry','addWorkout',
  'createPlan','updatePlan','setPlanEnabled','deletePlan','completePlan','startPlanTimer','pausePlanTimer',
  'resumePlanTimer','finishPlanTimer','finishAndCompletePlanTimer','saveDailyReview','addStudySession','updatePrivacy',
  'sendFriendRequest','acceptFriendRequest','removeFriend','createGroup','joinGroup','leaveGroup',
  'bindPlanToGroup','unbindPlanFromGroup','saveNote','deleteNote','saveBodyMetricPrefs',
  'markNotificationRead','markAllNotificationsRead','submitFeedback','updateFeedbackStatus'
])

function inferEntityId(event = {}, data = {}) {
  return event.planId || event.groupId || event.friendshipId || event.itemId || event.foodId || event.targetUserId ||
    data.plan?._id || data.group?._id || data.record?._id || data.food?._id || data.item?._id ||
    data.workout?._id || data.session?._id || data.checkin?._id || data.friendship?._id || data.note?._id ||
    data.notification?._id || data.feedback?._id || null
}

async function writeAudit({ userId, action, requestId, event, data }) {
  if (!MUTATING_ACTIONS.has(action)) return
  try {
    await db.collection(C.AUDIT_LOGS).add({ data: {
      userId,
      action,
      requestId,
      entityId: inferEntityId(event, data),
      createdAt: now()
    } })
  } catch (error) {
    // 审计失败不能影响业务主流程；云日志仍会保留 requestId。
    console.warn('[zilu-audit]', action, error?.message || error)
  }
}

module.exports = { writeAudit }
