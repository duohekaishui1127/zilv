const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { isGroupMember } = require('../services/social')
const { normalizeGroupPermissions } = require('../domain/group-policy')
const { getUserById } = require('../services/users')
const { applyPlanChange } = require('../services/group-plan-changes')
const { broadcastGroupPlanChange } = require('../services/group-plan-broadcasts')
const { disbandGroupRecords } = require('../services/group-lifecycle')

async function assertGroupOwner(groupId, userId) {
  const membership = await isGroupMember(groupId, userId)
  if (!membership || membership.role !== 'OWNER') throw fail('GROUP_OWNER_REQUIRED', '仅群主可以执行此操作')
  const group = await db.collection(C.GROUPS).doc(groupId).get().then(x => x.data).catch(() => null)
  if (!group) throw fail('NOT_FOUND', '群组不存在')
  return group
}

async function joinGroup({ user, event, localDate }) {
  const code = String(event.inviteCode || '').trim().toUpperCase()
  const result = await db.collection(C.GROUPS).where({ inviteCode:code }).limit(1).get()
  if (!result.data.length) throw fail('NOT_FOUND', '群组邀请码无效')
  const group = result.data[0]
  if (group.status === 'DISBANDED') throw fail('GROUP_DISBANDED', '该群组已解散')
  const active = await isGroupMember(group._id, user._id)
  if (active) return { group,joinStatus:'ACTIVE' }
  const existingResult = await db.collection(C.GROUP_MEMBERS).where({ groupId:group._id,userId:user._id }).limit(1).get()
  const existing = existingResult.data[0] || null
  const permissions = normalizeGroupPermissions(group)
  if (existing?.status === 'AUTO_REMOVED' && permissions.blockRejoinAfterAutoRemove) {
    throw fail('GROUP_REJOIN_BLOCKED', '你曾因连续未打卡被移出，当前群规则禁止再次加入')
  }
  if (existing?.status === 'KICKED' && existing.rejoinBlocked !== false) {
    throw fail('GROUP_REJOIN_BLOCKED', '你已被群主移出，当前不允许再次加入')
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

async function reviewGroupPlanChange({ user, event, localDate }) {
  const groupId = String(event.groupId || '')
  await assertGroupOwner(groupId,user._id)
  const request = await db.collection(C.GROUP_PLAN_CHANGES).doc(String(event.requestId || '')).get().then(x => x.data).catch(() => null)
  if (!request || request.status !== 'PENDING' || !request.groupIds?.includes(groupId)) throw fail('NOT_FOUND', '计划变更申请不存在或已处理')
  if ((request.approvedGroupIds || []).includes(groupId)) return { status:'PENDING',waiting:true }
  const timestamp = now()
  if (event.approve !== true) {
    await db.collection(C.GROUP_PLAN_CHANGES).doc(request._id).update({ data:{
      status:'REJECTED',rejectedGroupIds:[...(request.rejectedGroupIds || []),groupId],reviewedAt:timestamp,updatedAt:timestamp
    } })
    return { status:'REJECTED' }
  }
  const approvedGroupIds=[...new Set([...(request.approvedGroupIds || []),groupId])]
  const fullyApproved=request.groupIds.every(id => approvedGroupIds.includes(id))
  if (fullyApproved) {
    await applyPlanChange(request,localDate)
    const actor=await getUserById(request.userId)
    if (actor) await broadcastGroupPlanChange({ actor,change:request,sourceId:request._id })
  }
  const status=fullyApproved ? 'APPROVED' : 'PENDING'
  await db.collection(C.GROUP_PLAN_CHANGES).doc(request._id).update({ data:{ approvedGroupIds,status,reviewedAt:timestamp,updatedAt:timestamp } })
  return { status,waiting:!fullyApproved }
}

async function removeGroupMember({ user, event }) {
  const groupId=String(event.groupId || '')
  await assertGroupOwner(groupId,user._id)
  const memberUserId=String(event.memberUserId || '')
  const result=await db.collection(C.GROUP_MEMBERS).where({ groupId,userId:memberUserId,status:'ACTIVE' }).limit(1).get()
  const membership=result.data[0]
  if (!membership || membership.role === 'OWNER') throw fail('INVALID_PARAMETER', '不能移出该成员')
  const timestamp=now()
  await db.collection(C.GROUP_MEMBERS).doc(membership._id).update({ data:{
    status:'KICKED',kickedAt:timestamp,kickedBy:user._id,rejoinBlocked:event.blockRejoin !== false,updatedAt:timestamp
  } })
  const bindings=await db.collection(C.PLAN_GROUPS).where({ groupId,userId:memberUserId,enabled:true }).get()
  const changes=await db.collection(C.GROUP_PLAN_CHANGES).where({ userId:memberUserId,status:'PENDING' }).get()
  await Promise.all([
    ...bindings.data.map(item => db.collection(C.PLAN_GROUPS).doc(item._id).update({ data:{ enabled:false,updatedAt:timestamp } })),
    ...changes.data.filter(item => item.groupIds?.includes(groupId)).map(item => db.collection(C.GROUP_PLAN_CHANGES).doc(item._id).update({
      data:{ status:'REJECTED',rejectedGroupIds:[...(item.rejectedGroupIds || []),groupId],updatedAt:timestamp }
    }))
  ])
  return { removed:true }
}

async function disbandGroup({ user, event }) {
  const groupId=String(event.groupId || '')
  const group=await assertGroupOwner(groupId,user._id)
  await disbandGroupRecords(groupId,user._id,group.name)
  return { disbanded:true,groupId,groupName:group.name }
}

module.exports = { joinGroup, updateGroupSettings, reviewGroupJoinRequest, reviewGroupPlanChange, removeGroupMember, disbandGroup }
