const test = require('node:test')
const assert = require('node:assert/strict')
const { previousWeekRange, previousMonthRange, trailing90Range, reportPrompt } = require('../cloudfunctions/api/domain/review-period')

test('周报固定回顾上一个完整周一到周日', () => {
  const range=previousWeekRange('2026-09-28')
  assert.equal(range.startDate,'2026-09-21')
  assert.equal(range.endDate,'2026-09-27')
})

test('月报跨年时仍返回上一个完整自然月', () => {
  const range=previousMonthRange('2027-01-03')
  assert.equal(range.startDate,'2026-12-01')
  assert.equal(range.endDate,'2026-12-31')
})

test('90天复盘以昨天为结束日', () => {
  const range=trailing90Range('2026-09-28')
  assert.equal(range.endDate,'2026-09-27')
  assert.equal(range.days,90)
})

test('月初优先提示月报，周初其他时间提示周报，已读后不重复', () => {
  const monthly=reportPrompt({ proLifetime:true,reportViewMarks:{} },'2026-10-05')
  assert.equal(monthly.type,'MONTH')
  const weekly=reportPrompt({ reportViewMarks:{ MONTH:'MONTH:2026-09' } },'2026-10-05')
  assert.equal(weekly.type,'WEEK')
  assert.equal(reportPrompt({ reportViewMarks:{ MONTH:'MONTH:2026-09',WEEK:weekly.key } },'2026-10-05'),null)
})
