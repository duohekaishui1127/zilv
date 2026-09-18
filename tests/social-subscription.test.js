const test = require('node:test')
const assert = require('node:assert/strict')
const { invitationId } = require('../cloudfunctions/api/domain/group-invitation')
const {
  normalizeSocialSubscriptionType, shouldConsumeSocialSubscription
} = require('../cloudfunctions/api/domain/social-subscription')

test('群组邀请同一接收人同一天保持幂等，跨天允许再次邀请', () => {
  const first = invitationId('group-1', 'user-2', new Date('2026-09-18T01:00:00Z'))
  const repeated = invitationId('group-1', 'user-2', new Date('2026-09-18T22:00:00Z'))
  const nextDay = invitationId('group-1', 'user-2', new Date('2026-09-19T01:00:00Z'))
  assert.equal(first, repeated)
  assert.notEqual(first, nextDay)
})

test('长期模板发送成功后保留开关，一次性模板和无授权错误会消费开关', () => {
  assert.equal(normalizeSocialSubscriptionType('long_term'), 'LONG_TERM')
  assert.equal(normalizeSocialSubscriptionType('unknown'), 'ONE_TIME')
  assert.equal(shouldConsumeSocialSubscription('LONG_TERM'), false)
  assert.equal(shouldConsumeSocialSubscription('ONE_TIME'), true)
  assert.equal(shouldConsumeSocialSubscription('LONG_TERM', 43101), true)
})
