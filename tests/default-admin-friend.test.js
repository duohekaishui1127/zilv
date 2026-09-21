const test = require('node:test')
const assert = require('node:assert/strict')
const {
  configuredDefaultAdminShareCode,
  isDefaultAdminFriendship,
  defaultAdminFriendshipData
} = require('../cloudfunctions/api/domain/default-admin-friend')

test('默认管理员好友码优先使用专用配置并兼容反馈管理员配置', () => {
  assert.equal(configuredDefaultAdminShareCode(' ab12cd ', 'ZZ9999'), 'AB12CD')
  assert.equal(configuredDefaultAdminShareCode('', ' aa1111, bb2222 '), 'AA1111')
  assert.equal(configuredDefaultAdminShareCode('', ''), '')
})

test('默认管理员好友关系为已接受且受保护', () => {
  const timestamp = new Date('2026-09-21T00:00:00.000Z')
  const data = defaultAdminFriendshipData('admin', 'member', timestamp)
  assert.equal(data.userA, 'admin')
  assert.equal(data.userB, 'member')
  assert.equal(data.status, 'ACCEPTED')
  assert.equal(data.requestedBy, 'admin')
  assert.equal(data.defaultAdmin, true)
  assert.equal(data.protected, true)
  assert.equal(isDefaultAdminFriendship(data), true)
  assert.equal(isDefaultAdminFriendship({ status: 'ACCEPTED' }), false)
})

test('回填旧关系时保留原接受时间', () => {
  const acceptedAt = new Date('2026-09-20T00:00:00.000Z')
  const timestamp = new Date('2026-09-21T00:00:00.000Z')
  const data = defaultAdminFriendshipData('admin', 'member', timestamp, { acceptedAt })
  assert.equal(data.acceptedAt, acceptedAt)
  assert.equal(data.defaultAdminSince, timestamp)
})
