const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEADLINE_REMINDER_DAYS,
  deadlineDaysRemaining,
  deadlineReminderDue,
  reminderTimeReached
} = require('../cloudfunctions/reminder-dispatch/deadline-goal-rules')

function goal(overrides = {}) {
  return {
    planType: 'LONG_TERM',
    goalType: 'DEADLINE',
    goalStatus: 'ACTIVE',
    enabled: true,
    deadlineDate: '2027-04-10',
    ...overrides
  }
}

test('考试倒计时只在五个固定节点触发', () => {
  assert.deepEqual(DEADLINE_REMINDER_DAYS, [200, 100, 30, 7, 1])
  for (const [date, days] of [
    ['2026-09-22', 200], ['2026-12-31', 100], ['2027-03-11', 30],
    ['2027-04-03', 7], ['2027-04-09', 1]
  ]) {
    assert.equal(deadlineDaysRemaining(date, '2027-04-10'), days)
    assert.equal(deadlineReminderDue(goal(), date), days)
  }
  assert.equal(deadlineReminderDue(goal(), '2027-04-08'), null)
})

test('归档、停用或非考试目标不触发倒计时提醒', () => {
  assert.equal(deadlineReminderDue(goal({ enabled: false }), '2027-04-09'), null)
  assert.equal(deadlineReminderDue(goal({ goalStatus: 'COMPLETED' }), '2027-04-09'), null)
  assert.equal(deadlineReminderDue(goal({ goalType: 'HABIT' }), '2027-04-09'), null)
  assert.equal(deadlineReminderDue(goal({ deadlineReminderDaysSent: [1] }), '2027-04-09'), null)
})

test('长期目标消息中心提醒始终开启并兼容旧开关数据', () => {
  assert.equal(deadlineReminderDue(goal({ reminderEnabled: false }), '2027-04-09'), 1)
})

test('考试提醒默认在用户当地上午九点后发送', () => {
  assert.equal(reminderTimeReached('08:59'), false)
  assert.equal(reminderTimeReached('09:00'), true)
  assert.equal(reminderTimeReached('12:30'), true)
  assert.equal(reminderTimeReached('08:30', '08:00'), true)
})
