const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { uniqueCode } = require('../services/users')
const { isGroupMember } = require('../services/social')
const { normalizeGroupPermissions } = require('../domain/group-policy')
const { pinnedFirst } = require('../domain/social-list')
const { publicCommitment, requestGroupPlanChange, applyPlanChange } = require('../services/group-plan-changes')
const { broadcastGroupPlanChange } = require('../services/group-plan-broadcasts')
const { isExecutionPlan } = require('../domain/plan-definition')
const { longTermContext } = require('../services/long-term-goals')

async function groupById(groupId) {
  const group = await db.collection(C.GROUPS).doc(groupId).get().then(x => x.data).catch(() => null)
  return group?.status === 'DISBANDED' ? null : group
}

async function createGroup({ user, event, localDate }) {
  const name = String(event.name || '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '群组名称不能为空')
  const inviteCode = await uniqueCode(C.GROUPS, 'inviteCode', 6)
  const group = {
    name: name.slice(0, 80), avatar: '', ownerUserId: user._id,
    description: String(event.description || '').slice(0, 300), inviteCode,
    status: 'ACTIVE',
    ...normalizeGroupPermissions(event.permissions),
    createdAt: now(), updatedAt: now()
  }
  const add = await db.collection(C.GROUPS).add({ data: group })
  await db.collection(C.GROUP_MEMBERS).add({ data: { groupId: add._id, userId: user._id, role: 'OWNER', status: 'ACTIVE', joinedDate: localDate, joinedAt: now() } })
  return { group: { _id: add._id, ...group } }
}

async function leaveGroup({ user, event }) {
  const member = await isGroupMember(event.groupId, user._id)
  if (!member) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  if (member.role === 'OWNER') throw fail('GROUP_OWNER_CANNOT_LEAVE', '群主暂不能直接退出群组')
  await db.collection(C.GROUP_MEMBERS).doc(member._id).update({ data: { status: 'LEFT', leftAt: now() } })
  const bindings = await db.collection(C.PLAN_GROUPS).where({ groupId: event.groupId, userId: user._id, enabled: true }).get()
  const changes = await db.collection(C.GROUP_PLAN_CHANGES).where({ userId:user._id,status:'PENDING' }).get()
  const timestamp = now()
  await Promise.all([
    ...bindings.data.map(binding => db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data: { enabled:false,updatedAt:timestamp } })),
    ...changes.data.filter(item => item.groupIds?.includes(event.groupId)).map(item => db.collection(C.GROUP_PLAN_CHANGES).doc(item._id).update({
      data:{ status:'REJECTED',rejectedGroupIds:[...(item.rejectedGroupIds || []),event.groupId],updatedAt:timestamp }
    }))
  ])
  return { left: true }
}

async function getGroups({ user }) {
  const [memberships,pendingMemberships] = await Promise.all([
    db.collection(C.GROUP_MEMBERS).where({ userId:user._id,status:'ACTIVE' }).get(),
    db.collection(C.GROUP_MEMBERS).where({ userId:user._id,status:'PENDING' }).get()
  ])
  const groups = await Promise.all(memberships.data.map(async member => {
    const group = await groupById(member.groupId)
    if (!group) return null
    const count = await db.collection(C.GROUP_MEMBERS).where({ groupId: group._id, status: 'ACTIVE' }).count()
    return {
      ...group, memberCount:count.total,role:member.role,
      remark:member.remark || '',displayName:member.remark || group.name,
      pinned:Boolean(member.pinned),pinnedAt:member.pinnedAt || null
    }
  }))
  const pendingGroups = await Promise.all(pendingMemberships.data.map(async member => {
    const group = await groupById(member.groupId)
    return group ? { _id:group._id,name:group.name,requestedAt:member.requestedAt } : null
  }))
  return {
    groups:pinnedFirst(groups.filter(Boolean)),
    pendingGroups:pendingGroups.filter(Boolean)
  }
}

async function updateGroupMemberSettings({ user, event }) {
  const groupId = String(event.groupId || '')
  const membership = await isGroupMember(groupId,user._id)
  if (!membership) throw fail('GROUP_PERMISSION_DENIED','你不是该群成员')
  const pinned = event.pinned === undefined ? Boolean(membership.pinned) : Boolean(event.pinned)
  const timestamp = now()
  const data = {
    remark:String(event.remark || '').trim().slice(0,30),
    pinned,
    pinnedAt:pinned ? (membership.pinned && membership.pinnedAt ? membership.pinnedAt : timestamp) : null,
    updatedAt:timestamp
  }
  await db.collection(C.GROUP_MEMBERS).doc(membership._id).update({ data })
  return { settings:data }
}

async function bindPlanToGroup({ user, event }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!isExecutionPlan(plan)) throw fail('INVALID_PARAMETER', '长期目标保持私密，不能绑定群组')
  if (!(await isGroupMember(event.groupId, user._id))) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const existing = await db.collection(C.PLAN_GROUPS).where({ planId: plan._id, groupId: event.groupId, userId: user._id }).limit(1).get()
  if (existing.data.length) {
    const update = { enabled:true,commitment:publicCommitment(plan),updatedAt:now() }
    await db.collection(C.PLAN_GROUPS).doc(existing.data[0]._id).update({ data:update })
    return { binding:{ ...existing.data[0],...update } }
  }
  const data = { planId:plan._id,groupId:event.groupId,userId:user._id,enabled:true,commitment:publicCommitment(plan),createdAt:now(),updatedAt:now() }
  const add = await db.collection(C.PLAN_GROUPS).add({ data })
  return { binding: { _id: add._id, ...data } }
}

async function unbindPlanFromGroup({ user, event, localDate, requestId }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const existing = await db.collection(C.PLAN_GROUPS).where({ planId: event.planId, groupId: event.groupId, userId: user._id }).limit(1).get()
  if (!existing.data.length) return { unbound: true }
  const decision=await requestGroupPlanChange({ userId:user._id,plan,type:'UNBIND',groupId:String(event.groupId || '') })
  if (decision.approvalRequired) return { approvalRequired:true,request:decision.request }
  const result=await applyPlanChange(decision.change,localDate)
  await broadcastGroupPlanChange({ actor:user,change:decision.change,sourceId:requestId })
  return result
}

async function getPlanBindings({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!isExecutionPlan(plan)) throw fail('INVALID_PARAMETER', '长期目标不提供绑定入口')
  const [groupsResult, bindingsResult, goalContext] = await Promise.all([
    getGroups({ user }),
    db.collection(C.PLAN_GROUPS).where({ planId: plan._id, userId: user._id, enabled: true }).get(),
    longTermContext(user._id, localDate)
  ])
  const boundIds = new Set(bindingsResult.data.map(x => x.groupId))
  const goalIds = new Set(Array.isArray(plan.longTermGoalIds) ? plan.longTermGoalIds : [])
  return {
    managedByGoalId:plan.managedByGoalId || '',
    goals: goalContext.goals.filter(goal => goal.goalStatus === 'ACTIVE'
      && goal.goalType !== 'ACCUMULATION' && !plan.managedByGoalId)
      .map(goal => ({ _id:goal._id,name:goal.name,goalType:goal.goalType,bound:goalIds.has(goal._id) })),
    groups: groupsResult.groups.map(group => ({ ...group, bound: boundIds.has(group._id) }))
  }
}

module.exports = {
  createGroup, leaveGroup, getGroups, bindPlanToGroup, unbindPlanFromGroup,
  getPlanBindings, updateGroupMemberSettings
}
