const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeFriendRequestMessage, friendRelationshipState
} = require('../cloudfunctions/api/domain/friend-request')

test('好友申请备注会整理空白并限制为60字', () => {
  assert.equal(normalizeFriendRequestMessage('  学习群的\n小明  '), '学习群的 小明')
  assert.equal(normalizeFriendRequestMessage('一'.repeat(80)).length, 60)
})

test('群成员页能区分好友关系和申请方向', () => {
  assert.equal(friendRelationshipState(null, 'me', 'other'), 'NONE')
  assert.equal(friendRelationshipState({ status:'PENDING',requestedBy:'me' }, 'me', 'other'), 'PENDING_OUTGOING')
  assert.equal(friendRelationshipState({ status:'PENDING',requestedBy:'other' }, 'me', 'other'), 'PENDING_INCOMING')
  assert.equal(friendRelationshipState({ status:'ACCEPTED' }, 'me', 'other'), 'ACCEPTED')
  assert.equal(friendRelationshipState(null, 'me', 'me'), 'SELF')
})
