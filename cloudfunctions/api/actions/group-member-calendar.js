const { db, _, C } = require('../lib/db')
const { dateOnly, fail } = require('../lib/utils')
const { normalizedMonth, monthDates, buildCheckinCalendar } = require('../domain/checkin-calendar')
const { friendRelationshipState } = require('../domain/friend-request')
const { getUserById } = require('../services/users')
const { isGroupMember, friendshipBetween } = require('../services/social')

function joinedDateOf(membership, fallback) {
  if (membership?.joinedDate) return String(membership.joinedDate)
  const joinedAt = new Date(membership?.joinedAt || '')
  return Number.isNaN(joinedAt.getTime()) ? fallback : dateOnly(joinedAt)
}

async function getGroupMemberCalendar({ user, event, localDate }) {
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
  const joinedDate=joinedDateOf(targetMembership,localDate)
  const queryStart=joinedDate > startDate ? joinedDate : startDate
  const queryEnd=localDate < endDate ? localDate : endDate
  const checkinQuery=queryStart <= queryEnd
    ? db.collection(C.CHECKINS).where({ userId:memberUserId,date:_.gte(queryStart).and(_.lte(queryEnd)) }).get()
    : Promise.resolve({ data:[] })
  const [member,bindings,checkins,friendship] = await Promise.all([
    getUserById(memberUserId),
    db.collection(C.PLAN_GROUPS).where({ groupId,userId:memberUserId,enabled:true }).get(),
    checkinQuery,
    user._id === memberUserId ? null : friendshipBetween(user._id,memberUserId)
  ])
  if (!member) throw fail('NOT_FOUND','群成员不存在')
  const plans=(await Promise.all(bindings.data.map(binding => db.collection(C.PLANS).doc(binding.planId).get()
    .then(result => result.data).catch(() => null)))).filter(plan => plan && !plan.deletedAt)
  const calendar=buildCheckinCalendar(month,plans,checkins.data,{ startDate:joinedDate,endDate:localDate })
  return {
    member:{ _id:member._id,nickname:member.nickname,avatar:member.avatar,role:targetMembership.role,joinedDate },
    friendState:friendRelationshipState(friendship,user._id,memberUserId),
    trackingStartDate:joinedDate,
    ...calendar
  }
}

module.exports = { getGroupMemberCalendar }
