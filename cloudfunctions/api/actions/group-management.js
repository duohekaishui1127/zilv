const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { isGroupMember } = require('../services/social')
const { normalizeGroupPermissions } = require('../domain/group-policy')

async function assertGroupOwner(groupId, userId) {
  const membership = await isGroupMember(groupId, userId)
  if (!membership || membership.role !== 'OWNER') throw fail('GROUP_OWNER_REQUIRED', '仅群主可以修改群权限')
  const group = await db.collection(C.GROUPS).doc(groupId).get().then(x => x.data).catch(() => null)
  if (!group) throw fail('NOT_FOUND', '群组不存在')
  return group
}

async function joinGroup({ user, event, localDate }) {
  const code = String(event.inviteCode || '').trim().toUpperCase()
  const result = await db.collection(C.GROUPS).where({ inviteCode:code }).limit(1).get()
  if (!result.data.length) throw fail('NOT_FOUND', '群组邀请码无效')
  const group = result.data[0]
  const active = await isGroupMember(group._id, user._id)
  if (active) return { group,joinStatus:'ACTIVE' }
  const existingResult = await db.collection(C.GROUP_MEMBERS).where({ groupId:group._id,userId:user._id }).limit(1).get()
  const existing = existingResult.data[0] || null
  const permissions = normalizeGroupPermissions(group)
  if (existing?.status === 'AUTO_REMOVED' && permissions.blockRejoinAfterAutoRemove) {
    throw fail('GROUP_REJOIN_BLOCKED', '你曾因连续未打卡被移出，当前群规则禁止再次加入')
  }
  if (existing?.status === 'PENDING') return { group,joinStatus:'PENDING' }
  const timestamp = now()
  const status = permissions.joinApprovalRequired ? 'PENDING' : 'ACTIVE'
  const data = status === 'ACTIVE'
    ? { role:'MEMBER',status,joinedDate:localDate,joinedAt:timestamp,updatedAt:timestamp }
    : { role:'MEMBER',status,requestedAt:timestamp,updatedAt:timestamp }
  if (existing) await db.collection(C.GROUP_MEMBERS).doc(existing._id).update({ data })
  else await db.collection(C.GROUP_MEMBERS).add({ data:{ groupId:group._id,userId:user._id,...data,createdAt:timestamp } })
  return { group,joinStatus:status }
}

async function updateGroupSettings({ user, event }) {
  const groupId = String(event.groupId || '')
  const group = await assertGroupOwner(groupId, user._id)
  const permissions = normalizeGroupPermissions({ ...group,...event.permissions })
  await db.collection(C.GROUPS).doc(groupId).update({ data:{ ...permissions,lastInactivitySweepDate:'',updatedAt:now() } })
  return { permissions }
}

async function reviewGroupJoinRequest({ user, event, localDate }) {
  const groupId = String(event.groupId || '')
  await assertGroupOwner(groupId, user._id)
  const membership = await db.collection(C.GROUP_MEMBERS).doc(String(event.membershipId || '')).get().then(x => x.data).catch(() => null)
  if (!membership || membership.groupId !== groupId || membership.status !== 'PENDING') throw fail('NOT_FOUND', '入群申请不存在或已处理')
  const approve = event.approve === true
  const timestamp = now()
  const data = approve
    ? { status:'ACTIVE',joinedDate:localDate,joinedAt:timestamp,reviewedAt:timestamp,reviewedBy:user._id,updatedAt:timestamp }
    : { status:'REJECTED',rejectedAt:timestamp,reviewedAt:timestamp,reviewedBy:user._id,updatedAt:timestamp }
  await db.collection(C.GROUP_MEMBERS).doc(membership._id).update({ data })
  return { approved:approve }
}

module.exports = { joinGroup, updateGroupSettings, reviewGroupJoinRequest }
