const test = require('node:test')
const assert = require('node:assert/strict')
const { previousDate, streakFromDates, presentDailyReview } = require('../cloudfunctions/api/domain/daily-review')

test('连续打卡按今天向前计算并正确跨月', () => {
  assert.equal(previousDate('2026-03-01'), '2026-02-28')
  assert.equal(streakFromDates(['2026-03-01', '2026-02-28', '2026-02-27'], '2026-03-01'), 3)
})

test('今天未打卡或中间断开时停止累计', () => {
  assert.equal(streakFromDates(['2026-09-17'], '2026-09-18'), 0)
  assert.equal(streakFromDates(['2026-09-18', '2026-09-16'], '2026-09-18'), 1)
})

test('整日打卡区分任务完成和任务未完成状态', () => {
  assert.equal(presentDailyReview({ autoCompleted: true }).checkinState, 'COMPLETE')
  assert.equal(presentDailyReview({ checkinMode: 'MANUAL', autoCompleted: false }).checkinState, 'INCOMPLETE')
  assert.equal(presentDailyReview({ checkinMode: 'MANUAL', allPlansCompleted: true }).checkinState, 'COMPLETE')
  assert.equal(presentDailyReview({ status: 'REVOKED', autoCompleted: true }).allPlansCompleted, false)
})
