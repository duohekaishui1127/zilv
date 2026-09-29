const { todayForUser } = require('./makeup-cards')
const { parseDateOnly, fail } = require('../lib/utils')
const CURRENT_DAY_WRITES = new Set(['completePlan','revokePlanCompletion','manualDailyCheckin','startPlanTimer','createPlan','updatePlan','setPlanEnabled','deletePlan','createLongTermGoal','updateLongTermGoal','deleteLongTermGoal','completeLongTermGoal','setPlanLongTermGoalBinding'])

function requestDate(action, event, user, at = new Date()) {
  const today = todayForUser(user || {},at)
  if (action === 'saveDailyReview') {
    const selected = event.reviewDate || event.date || today
    if (!parseDateOnly(selected) || selected > today) throw fail('INVALID_PARAMETER','只能编辑已有日期的打卡记录')
    return selected
  }
  if (CURRENT_DAY_WRITES.has(action) && event.date && event.date !== today) {
    throw fail('DAY_CHANGED','日期已更新，请刷新后重试')
  }
  // Dates chosen in calendars are explicit query fields, never business time.
  return today
}

module.exports = { requestDate }
