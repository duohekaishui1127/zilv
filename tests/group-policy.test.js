const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeGroupPermissions, shouldAutoRemoveMember } = require('../cloudfunctions/api/domain/group-policy')

test('群权限限制自动移出天数并默认禁止重新加入', () => {
  assert.deepEqual(normalizeGroupPermissions({ autoRemoveInactiveDays:999 }), {
    joinApprovalRequired:false, autoRemoveInactiveDays:365, blockRejoinAfterAutoRemove:true
  })
})

test('成员达到连续未打卡天数后自动移出，群主不受影响', () => {
  const member = { role:'MEMBER',status:'ACTIVE',joinedDate:'2026-09-01',lastGroupCheckinDate:'2026-09-05' }
  assert.equal(shouldAutoRemoveMember(member,'2026-09-07',3),false)
  assert.equal(shouldAutoRemoveMember(member,'2026-09-08',3),true)
  assert.equal(shouldAutoRemoveMember({ ...member,role:'OWNER' },'2026-09-20',3),false)
})
