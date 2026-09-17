const test = require('node:test')
const assert = require('node:assert/strict')
const { localParts, reminderContext, weekRange } = require('../cloudfunctions/reminder-dispatch/reminder-rules')

test('提醒按计划保存的时区计算本地时间', () => {
  const parts = localParts(new Date('2026-09-16T13:03:00Z'), 480)
  assert.deepEqual(parts, { date: '2026-09-16', time: '21:03', minutes: 1263, weekday: 3 })
})

test('到达提醒时间且计划当天有效时进入发送窗口', () => {
  const plan = {
    enabled: true,
    reminderEnabled: true,
    reminderTime: '21:00',
    reminderTimezoneOffset: 480,
    repeatType: 'SPECIFIC_WEEKDAYS',
    repeatConfig: { weekdays: [1, 3, 5] },
    startDate: '2026-09-01'
  }
  assert.equal(reminderContext(plan, new Date('2026-09-16T13:03:00Z'))?.date, '2026-09-16')
  assert.equal(reminderContext(plan, new Date('2026-09-15T13:03:00Z')), null)
  assert.equal(reminderContext(plan, new Date('2026-09-16T13:15:00Z')), null)
})

test('每周计划使用周一到周日统计窗口', () => {
  assert.deepEqual(weekRange('2026-09-16'), { startDate: '2026-09-14', endDate: '2026-09-20' })
})
