const { db, _, C } = require('../lib/db')
const { dateOnly, now } = require('../lib/utils')
const { normalizeGroupPermissions, shouldAutoRemoveMember } = require('../domain/group-policy')

function joinedDateOf(member, fallback) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(member?.joinedDate || ''))) return member.joinedDate
  const joinedAt = new Date(member?.joinedAt || '')
  return Number.isNaN(joinedAt.getTime()) ? fallback : dateOnly(joinedAt)
}

async function lastGroupCheckinDate(groupId, member, localDate) {
  const bindings = await db.collection(C.PLAN_GROUPS).where({ groupId, userId:member.userId, enabled:true }).get()
  const planIds = new Set(bindings.data.map(item => item.planId))
  if (!planIds.size) return { date:'', bindings:bindings.data }
  const joinedDate = joinedDateOf(member, localDate)
  const result = await db.collection(C.CHECKINS).where({
    userId:member.userId,
    completed:true,
    date:_.gte(joinedDate).and(_.lte(localDate))
  }).get()
  const dates = result.data.filter(item => planIds.has(item.planId)).map(item => item.date).sort()
  return { date:dates[dates.length - 1] || '', bindings:bindings.data }
}

async function enforceGroupInactivity(group, localDate) {
  const permissions = normalizeGroupPermissions(group)
  if (!permissions.autoRemoveInactiveDays) return { removed:0 }
  const members = await db.collection(C.GROUP_MEMBERS).where({ groupId:group._id, status:'ACTIVE' }).get()
  let removed = 0
  for (const member of members.data) {
    if (member.role === 'OWNER') continue
    const activity = await lastGroupCheckinDate(group._id, member, localDate)
    const joinedDate = joinedDateOf(member, localDate)
    if (!shouldAutoRemoveMember({ ...member,joinedDate,lastGroupCheckinDate:activity.date }, localDate, permissions.autoRemoveInactiveDays)) continue
    const timestamp = now()
    await db.collection(C.GROUP_MEMBERS).doc(member._id).update({ data:{
      status:'AUTO_REMOVED', autoRemovedAt:timestamp, autoRemovedDate:localDate,
      removalReason:`连续${permissions.autoRemoveInactiveDays}天未完成群组打卡`, updatedAt:timestamp
    } })
    const changes=await db.collection(C.GROUP_PLAN_CHANGES).where({ userId:member.userId,status:'PENDING' }).get()
    await Promise.all([
      ...activity.bindings.map(binding => db.collection(C.PLAN_GROUPS).doc(binding._id).update({ data:{ enabled:false,updatedAt:timestamp } })),
      ...changes.data.filter(item => item.groupIds?.includes(group._id)).map(item => db.collection(C.GROUP_PLAN_CHANGES).doc(item._id).update({
        data:{ status:'REJECTED',rejectedGroupIds:[...(item.rejectedGroupIds || []),group._id],updatedAt:timestamp }
      }))
    ])
    removed++
  }
  return { removed }
}

module.exports = { joinedDateOf, enforceGroupInactivity }
