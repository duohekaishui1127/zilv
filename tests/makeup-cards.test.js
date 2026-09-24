const test = require('node:test')
const assert = require('node:assert/strict')
const { CARD_CAP, INITIAL_CARDS, INITIAL_GRANT_VERSION, dateAtOffset, todayForUser, previousDate, makeupCardState } = require('../cloudfunctions/api/domain/makeup-cards')

test('新用户和从未领取过补签卡的旧用户初始为三张', () => {
  assert.equal(INITIAL_CARDS, 3)
  assert.deepEqual(makeupCardState({}, '2026-09-24'), { balance: 3, grantMonth: '2026-09' })
})

test('旧规则已领取一张的用户一次性补差，保留已消耗数量', () => {
  const legacy = { makeupCardBalance: 1, makeupCardGrantMonth: '2026-09' }
  assert.deepEqual(makeupCardState(legacy, '2026-09-24'), { balance: 3, grantMonth: '2026-09' })
  assert.deepEqual(makeupCardState({ ...legacy, makeupCardBalance: 0 }, '2026-09-24'),
    { balance: 2, grantMonth: '2026-09' })
  assert.deepEqual(makeupCardState({ ...legacy, makeupCardBalance: 2, makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION }, '2026-09-24'),
    { balance: 2, grantMonth: '2026-09' })
})

test('跨月每月增加一张，最多保留三张', () => {
  const user = { makeupCardBalance: 0, makeupCardGrantMonth: '2026-09', makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION }
  assert.deepEqual(makeupCardState(user, '2026-09-30'), { balance: 0, grantMonth: '2026-09' })
  assert.deepEqual(makeupCardState(user, '2026-10-01'), { balance: 1, grantMonth: '2026-10' })
  assert.deepEqual(makeupCardState(user, '2027-01-01'), { balance: CARD_CAP, grantMonth: '2027-01' })
})

test('用户时区跨月回退时不会重复领取当月补签卡', () => {
  const user = { makeupCardBalance: 1, makeupCardGrantMonth: '2026-10', makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION }
  assert.deepEqual(makeupCardState(user, '2026-09-30'), { balance: 1, grantMonth: '2026-10' })
  assert.deepEqual(makeupCardState(user, '2026-10-01'), { balance: 1, grantMonth: '2026-10' })
})

test('昨天的日期正确跨越月末、年末和闰日', () => {
  assert.equal(previousDate('2026-10-01'), '2026-09-30')
  assert.equal(previousDate('2027-01-01'), '2026-12-31')
  assert.equal(previousDate('2024-03-01'), '2024-02-29')
})

test('补签窗口按服务器保存的用户时区判定', () => {
  const at = new Date('2026-09-30T16:05:00Z')
  assert.equal(dateAtOffset(at, 480), '2026-10-01')
  assert.equal(todayForUser({}, at), '2026-10-01')
  assert.equal(todayForUser({ checkinReminderTimezoneOffset: 0 }, at), '2026-09-30')
})

test('伪造前天的补签请求在读写数据库前被拒绝', async () => {
  const { makeupDailyCheckin } = require('../cloudfunctions/api/services/makeup-checkins')
  const oldDate = previousDate(previousDate(todayForUser()))
  await assert.rejects(
    makeupDailyCheckin({ user: {}, event: { makeupDate: oldDate, completedPlanIds: [] } }),
    error => error.code === 'MAKEUP_DATE_INVALID'
  )
})

test('普通打卡不能用伪造日期绕过补签卡', async () => {
  const { manualDailyCheckin } = require('../cloudfunctions/api/actions/daily-reviews')
  const oldDate = previousDate(todayForUser())
  await assert.rejects(
    manualDailyCheckin({ user: {}, localDate: oldDate }),
    error => error.code === 'MAKEUP_REQUIRED'
  )
})
