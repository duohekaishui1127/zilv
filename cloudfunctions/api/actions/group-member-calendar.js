const { db, _, C } = require('../lib/db')
const { fail } = require('../lib/utils')
const { normalizedMonth, monthDates, buildCheckinCalendar } = require('../domain/checkin-calendar')
const { friendRelationshipState } = require('../domain/friend-request')
const { getUserById } = require('../services/users')
const { isGroupMember, friendshipBetween } = require('../services/social')

async function getGroupMemberCalendar({ user, event }) {
  const groupId=String(event.groupId || '')
  const memberUserId=String(event.memberUserId || '')
  const [viewerMembership,targetMembership] = await Promise.all([
    isGroupMember(groupId,user._id),isGroupMember(groupId,memberUserId)
  ])
  if (!viewerMembership || !targetMembership) throw fail('GROUP_PERMISSION_DENIED','只能查看同群成员的监督进度')
  const month=normalizedMonth(event.month)
  const dates=monthDates(month)
  const startDate=dates[0]
  const endDate=dates[dates.length - 1]
  const [member,bindings,checkins,friendship] = await Promise.all([
    getUserById(memberUserId),
    db.collection(C.PLAN_GROUPS).where({ groupId,userId:memberUserId,enabled:true }).get(),
    db.collection(C.CHECKINS).where({ userId:memberUserId,date:_.gte(startDate).and(_.lte(endDate)) }).get(),
    user._id === memberUserId ? null : friendshipBetween(user._id,memberUserId)
  ])
  if (!member) throw fail('NOT_FOUND','群成员不存在')
  const plans=(await Promise.all(bindings.data.map(binding => db.collection(C.PLANS).doc(binding.planId).get()
    .then(result => result.data).catch(() => null)))).filter(plan => plan && !plan.deletedAt)
  const calendar=buildCheckinCalendar(month,plans,checkins.data)
  return {
    member:{ _id:member._id,nickname:member.nickname,avatar:member.avatar,role:targetMembership.role },
    friendState:friendRelationshipState(friendship,user._id,memberUserId),
    ...calendar
  }
}

module.exports = { getGroupMemberCalendar }
