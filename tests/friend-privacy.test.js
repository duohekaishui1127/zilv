const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizedFriendOverrides, effectiveFriendPrivacy, canSharePlanWithFriend
} = require('../cloudfunctions/api/domain/friend-privacy')

test('单好友默认模式继续跟随全局隐私', () => {
  const globalPrivacy = { showPlanStatusToFriends: true, showWeightToFriends: false }
  assert.deepEqual(effectiveFriendPrivacy(globalPrivacy, 'DEFAULT', { showPlanStatusToFriends: false }), globalPrivacy)
})

test('单好友自定义模式只覆盖允许的隐私字段', () => {
  const overrides = normalizedFriendOverrides({ showPlanStatusToFriends: false, unknownPermission: true })
  assert.deepEqual(overrides, { showPlanStatusToFriends: false })
  assert.deepEqual(effectiveFriendPrivacy({ showPlanStatusToFriends: true, showWeightToFriends: false }, 'CUSTOM', overrides), {
    showPlanStatusToFriends: false,
    showWeightToFriends: false
  })
})

test('关闭分类可见后不会通过计划汇总或特别关心暴露该分类', () => {
  const privacy = {
    showPlanStatusToFriends: true,
    showStudyStatusToFriends: false,
    showWorkoutStatusToFriends: true
  }
  assert.equal(canSharePlanWithFriend({ category: 'STUDY' }, privacy), false)
  assert.equal(canSharePlanWithFriend({ category: 'WORKOUT' }, privacy), true)
  assert.equal(canSharePlanWithFriend({ category: 'CUSTOM' }, privacy), true)
  assert.equal(canSharePlanWithFriend({ category: 'CUSTOM' }, { ...privacy, showPlanStatusToFriends: false }), false)
})
