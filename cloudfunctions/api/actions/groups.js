const { db, _, C } = require('../lib/db')
const { now, fail, weekRange } = require('../lib/utils')
const { getUserById, uniqueCode } = require('../services/users')
const { isBasePlanDue } = require('../services/plans')
const { isGroupMember } = require('../services/social')
const { sortGroupMemberProgress } = require('../domain/group-progress')
const { normalizeGroupPermissions } = require('../domain/group-policy')
const { enforceGroupInactivity } = require('../services/group-policy')

async function groupById(groupId) {
  return db.collection(C.GROUPS).doc(groupId).get().then(x => x.data).catch(() => null)
}

async function createGroup({ user, event, localDate }) {
  const name = String(event.name || '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '群组名称不能为空')
  const inviteCode = await uniqueCode(C.GROUPS, 'inviteCode', 6)
  const group = {
    name: name.slice(0, 80), avatar: '', ownerUserId: user._id,
    description: String(event.description || '').slice(0, 300), inviteCode,
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
  await Promise.all(bindings.data.map(binding => db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data: { enabled: false, updatedAt: now() } })))
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
    return { ...group, memberCount: count.total, role: member.role }
  }))
  const pendingGroups = await Promise.all(pendingMemberships.data.map(async member => {
    const group = await groupById(member.groupId)
    return group ? { _id:group._id,name:group.name,requestedAt:member.requestedAt } : null
  }))
  return { groups:groups.filter(Boolean),pendingGroups:pendingGroups.filter(Boolean) }
}

async function bindPlanToGroup({ user, event }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!(await isGroupMember(event.groupId, user._id))) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const existing = await db.collection(C.PLAN_GROUPS).where({ planId: plan._id, groupId: event.groupId, userId: user._id }).limit(1).get()
  if (existing.data.length) {
    await db.collection(C.PLAN_GROUPS).doc(existing.data[0]._id).update({ data: { enabled: true, updatedAt: now() } })
    return { binding: { ...existing.data[0], enabled: true } }
  }
  const data = { planId: plan._id, groupId: event.groupId, userId: user._id, enabled: true, createdAt: now(), updatedAt: now() }
  const add = await db.collection(C.PLAN_GROUPS).add({ data })
  return { binding: { _id: add._id, ...data } }
}

async function unbindPlanFromGroup({ user, event }) {
  const existing = await db.collection(C.PLAN_GROUPS).where({ planId: event.planId, groupId: event.groupId, userId: user._id }).limit(1).get()
  if (!existing.data.length) return { unbound: true }
  await db.collection(C.PLAN_GROUPS).doc(existing.data[0]._id).update({ data: { enabled: false, updatedAt: now() } })
  return { unbound: true }
}

async function getPlanBindings({ user, event }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const [groupsResult, bindingsResult] = await Promise.all([
    getGroups({ user }),
    db.collection(C.PLAN_GROUPS).where({ planId: plan._id, userId: user._id, enabled: true }).get()
  ])
  const boundIds = new Set(bindingsResult.data.map(x => x.groupId))
  return { groups: groupsResult.groups.map(group => ({ ...group, bound: boundIds.has(group._id) })) }
}

async function memberProgress(groupId, member, localDate) {
  const user = await getUserById(member.userId)
  if (!user) return null
  const bindings = await db.collection(C.PLAN_GROUPS).where({ groupId, userId: user._id, enabled: true }).get()
  const details = await Promise.all(bindings.data.map(async binding => {
    const plan = await db.collection(C.PLANS).doc(binding.planId).get().then(x => x.data).catch(() => null)
    if (!plan || !plan.enabled || plan.deletedAt || !isBasePlanDue(plan, localDate)) return null
    if (plan.repeatType === 'WEEKLY_COUNT') {
      const { startDate, endDate } = weekRange(localDate)
      const count = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: _.gte(startDate).and(_.lte(endDate)), completed: true }).count()
      const target = Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)
      return { completed: Math.min(count.total, target), target }
    }
    const checkin = await db.collection(C.CHECKINS).where({ userId: user._id, planId: binding.planId, date: localDate, completed: true }).limit(1).get()
    return { completed: checkin.data.length ? 1 : 0, target: 1 }
  }))
  const valid = details.filter(Boolean)
  return {
    _id: user._id, nickname: user.nickname, avatar: user.avatar, role: member.role,
    total: valid.reduce((sum, x) => sum + x.target, 0),
    completed: valid.reduce((sum, x) => sum + x.completed, 0)
  }
}

async function getGroupDetail({ user, event, localDate }) {
  const group = await groupById(event.groupId)
  if (!group) throw fail('NOT_FOUND', '群组不存在')
  await enforceGroupInactivity(group, localDate)
  const membership = await isGroupMember(event.groupId, user._id)
  if (!membership) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const [events, members, pending] = await Promise.all([
    db.collection(C.GROUP_EVENTS).where({ groupId: group._id }).orderBy('createdAt', 'desc').limit(50).get(),
    db.collection(C.GROUP_MEMBERS).where({ groupId: group._id, status: 'ACTIVE' }).get(),
    membership.role === 'OWNER'
      ? db.collection(C.GROUP_MEMBERS).where({ groupId:group._id,status:'PENDING' }).get()
      : Promise.resolve({ data:[] })
  ])
  const [memberViews, likes, pendingRequests] = await Promise.all([
    Promise.all(members.data.map(member => memberProgress(group._id, member, localDate))),
    db.collection(C.GROUP_EVENT_LIKES).where({ groupId: group._id, userId: user._id }).get(),
    Promise.all(pending.data.map(async item => {
      const applicant = await getUserById(item.userId)
      return applicant ? { membershipId:item._id,user:{ _id:applicant._id,nickname:applicant.nickname,avatar:applicant.avatar },requestedAt:item.requestedAt } : null
    }))
  ])
  const currentMember = members.data.find(member => member.userId === user._id)
  const likedIds = new Set(likes.data.map(item => item.eventId))
  const eventViews = events.data.map(item => ({
    ...item,
    status: item.status || 'ACTIVE',
    likeCount: Number(item.likeCount || 0),
    likedByMe: likedIds.has(item._id)
  }))
  return {
    group, events: eventViews, members: sortGroupMemberProgress(memberViews.filter(Boolean)),
    currentRole: currentMember?.role || 'MEMBER', pendingRequests:pendingRequests.filter(Boolean),
    permissions:normalizeGroupPermissions(group),
    wechatCheckinEnabled: Boolean(membership.wechatCheckinEnabled)
  }
}

module.exports = {
  createGroup, leaveGroup, getGroups, bindPlanToGroup, unbindPlanFromGroup,
  getPlanBindings, getGroupDetail
}
