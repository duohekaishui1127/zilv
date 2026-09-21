const test = require('node:test')
const assert = require('node:assert/strict')
const {
  localParts,checkinReminderContext,isPlanDue,weekRange,normalizeReminderSubscriptionType
} = require('../cloudfunctions/reminder-dispatch/reminder-rules')

test('打卡提醒默认一次性，只有显式配置才启用长期订阅', () => {
  assert.equal(normalizeReminderSubscriptionType(), 'ONE_TIME')
  assert.equal(normalizeReminderSubscriptionType('one_time'), 'ONE_TIME')
  assert.equal(normalizeReminderSubscriptionType('LONG_TERM'), 'LONG_TERM')
})

test('提醒按用户保存的时区计算本地时间', () => {
  const parts = localParts(new Date('2026-09-16T13:03:00Z'), 480)
  assert.deepEqual(parts, { date: '2026-09-16', time: '21:03', minutes: 1263, weekday: 3 })
})

test('到达全局打卡提醒时间时进入发送窗口', () => {
  const user = {
    checkinReminderEnabled: true,
    checkinReminderTime: '21:00',
    checkinReminderTimezoneOffset: 480
  }
  assert.equal(checkinReminderContext(user, new Date('2026-09-16T13:03:00Z'))?.date, '2026-09-16')
  assert.equal(checkinReminderContext(user, new Date('2026-09-16T12:59:00Z')), null)
  assert.equal(checkinReminderContext(user, new Date('2026-09-16T13:15:00Z')), null)
})

test('整日提醒仍按每项计划的周期筛选今日任务', () => {
  const plan = {
    repeatType: 'SPECIFIC_WEEKDAYS',
    repeatConfig: { weekdays: [1, 3, 5] },
    startDate: '2026-09-01'
  }
  assert.equal(isPlanDue(plan,localParts(new Date('2026-09-16T13:03:00Z'),480)),true)
  assert.equal(isPlanDue(plan,localParts(new Date('2026-09-15T13:03:00Z'),480)),false)
})

test('每周计划使用周一到周日统计窗口', () => {
  assert.deepEqual(weekRange('2026-09-16'), { startDate: '2026-09-14', endDate: '2026-09-20' })
})
