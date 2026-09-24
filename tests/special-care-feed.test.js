const test = require('node:test')
const assert = require('node:assert/strict')
const { todayWindowForUser } = require('../cloudfunctions/api/domain/special-care-feed')

test('特别关心动态只查询用户当地今天的完成时间', () => {
  const at = new Date('2026-09-24T15:59:30.000Z')
  const window = todayWindowForUser({ checkinReminderTimezoneOffset: 480 }, at)
  assert.equal(window.date, '2026-09-24')
  assert.equal(window.start.toISOString(), '2026-09-23T16:00:00.000Z')
  assert.equal(window.end.toISOString(), '2026-09-24T16:00:00.000Z')
  assert.ok(at >= window.start && at < window.end)
})

test('跨过午夜立即切换到新一天，不把昨天动态带入今天', () => {
  const at = new Date('2026-09-24T16:00:00.000Z')
  const window = todayWindowForUser({ checkinReminderTimezoneOffset: 480 }, at)
  assert.equal(window.date, '2026-09-25')
  assert.equal(window.start.toISOString(), at.toISOString())
  assert.equal(window.end.toISOString(), '2026-09-25T16:00:00.000Z')
})

test('其他合法时区按各自当地日期计算', () => {
  const at = new Date('2026-09-24T00:30:00.000Z')
  const utc = todayWindowForUser({ checkinReminderTimezoneOffset: 0 }, at)
  assert.equal(utc.start.toISOString(), '2026-09-24T00:00:00.000Z')
  const west = todayWindowForUser({ checkinReminderTimezoneOffset: -300 }, at)
  assert.equal(west.date, '2026-09-23')
  assert.equal(west.start.toISOString(), '2026-09-23T05:00:00.000Z')
})
