const DEADLINE_REMINDER_DAYS = Object.freeze([200, 100, 30, 7, 1])

function dateValue(value) {
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? Date.UTC(Number(match[1]),Number(match[2]) - 1,Number(match[3])) : null
}

function deadlineDaysRemaining(localDate,deadlineDate) {
  const from=dateValue(localDate)
  const to=dateValue(deadlineDate)
  return from == null || to == null ? null : Math.round((to - from) / 86400000)
}

function deadlineReminderDue(goal,localDate) {
  if(!goal || goal.planType !== 'LONG_TERM' || goal.goalType !== 'DEADLINE'
    || goal.goalStatus !== 'ACTIVE' || goal.enabled === false || goal.deletedAt)return null
  const daysRemaining=deadlineDaysRemaining(localDate,goal.deadlineDate)
  if(!DEADLINE_REMINDER_DAYS.includes(daysRemaining))return null
  return Array.isArray(goal.deadlineReminderDaysSent) && goal.deadlineReminderDaysSent.includes(daysRemaining)
    ? null : daysRemaining
}

function examArchiveDue(goal,localDate) {
  return Boolean(goal && goal.planType === 'LONG_TERM' && goal.goalType === 'DEADLINE'
    && goal.goalStatus === 'ACTIVE' && goal.enabled !== false && !goal.deletedAt
    && goal.deadlineDate && goal.deadlineDate <= localDate)
}

function examResultReminderDue(goal,localDate) {
  if(!goal || goal.planType !== 'LONG_TERM' || goal.goalType !== 'DEADLINE'
    || goal.goalStatus !== 'COMPLETED' || goal.completionMode !== 'EXAM_DATE' || goal.deletedAt
    || (goal.examResultStatus && goal.examResultStatus !== 'PENDING') || goal.examResultReminderSentAt)return false
  const daysRemaining=deadlineDaysRemaining(localDate,goal.deadlineDate)
  return daysRemaining != null && daysRemaining <= -60
}

function reminderTimeReached(localTime, reminderTime = '09:00') {
  const parse=value => {
    const match=String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const current=parse(localTime)
  const target=parse(reminderTime) ?? 540
  return current != null && current >= target
}

module.exports={
  DEADLINE_REMINDER_DAYS,deadlineDaysRemaining,deadlineReminderDue,
  examArchiveDue,examResultReminderDue,reminderTimeReached
}
