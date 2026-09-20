const { db, _, C } = require('../lib/db')
const { fail, weekRange } = require('../lib/utils')
const { getUserById } = require('../services/users')
const { isBasePlanDue } = require('../services/plans')
const { isGroupMember } = require('../services/social')
const { sortGroupMemberProgress } = require('../domain/group-progress')
const { normalizeGroupPermissions } = require('../domain/group-policy')
const { enforceGroupInactivity } = require('../services/group-policy')
const { pendingChangesForGroup } = require('../services/group-plan-changes')

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
  const group = await db.collection(C.GROUPS).doc(event.groupId).get().then(x => x.data).catch(() => null)
  if (!group || group.status === 'DISBANDED') throw fail('NOT_FOUND', '群组不存在或已解散')
  await enforceGroupInactivity(group, localDate)
  const membership = await isGroupMember(event.groupId, user._id)
  if (!membership) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const [events, members, pending, planChanges] = await Promise.all([
    db.collection(C.GROUP_EVENTS).where({ groupId: group._id }).orderBy('createdAt', 'desc').limit(50).get(),
    db.collection(C.GROUP_MEMBERS).where({ groupId: group._id, status: 'ACTIVE' }).get(),
    membership.role === 'OWNER' ? db.collection(C.GROUP_MEMBERS).where({ groupId:group._id,status:'PENDING' }).get() : Promise.resolve({ data:[] }),
    membership.role === 'OWNER' ? pendingChangesForGroup(group._id) : Promise.resolve([])
  ])
  const [memberViews, likes, pendingRequests, pendingPlanChanges] = await Promise.all([
    Promise.all(members.data.map(member => memberProgress(group._id, member, localDate))),
    db.collection(C.GROUP_EVENT_LIKES).where({ groupId: group._id, userId: user._id }).get(),
    Promise.all(pending.data.map(async item => {
      const applicant = await getUserById(item.userId)
      return applicant ? { membershipId:item._id,user:{ _id:applicant._id,nickname:applicant.nickname,avatar:applicant.avatar },requestedAt:item.requestedAt } : null
    })),
    Promise.all(planChanges.map(async item => {
      const applicant = await getUserById(item.userId)
      return applicant ? {
        _id:item._id,type:item.type,summary:item.summary,currentPlan:item.currentPlan,proposedPlan:item.proposedPlan,
        approvedCount:(item.approvedGroupIds || []).length,requiredCount:item.groupIds.length,
        applicant:{ _id:applicant._id,nickname:applicant.nickname,avatar:applicant.avatar }
      } : null
    }))
  ])
  const currentMember = members.data.find(member => member.userId === user._id)
  const likedIds = new Set(likes.data.map(item => item.eventId))
  const eventViews = events.data.map(item => ({
    ...item, status: item.status || 'ACTIVE', likeCount: Number(item.likeCount || 0), likedByMe: likedIds.has(item._id)
  }))
  return {
    group:{ ...group,remark:membership.remark || '',displayName:membership.remark || group.name,pinned:Boolean(membership.pinned) },
    events: eventViews, members: sortGroupMemberProgress(memberViews.filter(Boolean)),
    currentRole: currentMember?.role || 'MEMBER', pendingRequests:pendingRequests.filter(Boolean),
    pendingPlanChanges:pendingPlanChanges.filter(Boolean), permissions:normalizeGroupPermissions(group),
    wechatCheckinEnabled: Boolean(membership.wechatCheckinEnabled)
  }
}

module.exports = { getGroupDetail }
