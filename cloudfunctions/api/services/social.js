const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')

async function friendshipBetween(a, b) {
  const [ab, ba] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: a, userB: b }).limit(1).get(),
    db.collection(C.FRIENDSHIPS).where({ userA: b, userB: a }).limit(1).get()
  ])
  return ab.data[0] || ba.data[0] || null
}

async function isGroupMember(groupId, userId) {
  const r = await db.collection(C.GROUP_MEMBERS).where({ groupId, userId, status: 'ACTIVE' }).limit(1).get()
  return r.data[0] || null
}

async function emitGroupEventsForCheckin(user, plan, checkin) {
  const bindings = await db.collection(C.PLAN_GROUPS).where({ userId: user._id, planId: plan._id, enabled: true }).get()
  await Promise.all(bindings.data.map(async binding => {
    if (!(await isGroupMember(binding.groupId, user._id))) return
    const exists = await db.collection(C.GROUP_EVENTS).where({
      groupId: binding.groupId,
      checkinId: checkin._id,
      eventType: 'PLAN_COMPLETED'
    }).limit(1).get()
    if (exists.data.length) return
    await db.collection(C.GROUP_EVENTS).add({ data: {
      groupId: binding.groupId,
      userId: user._id,
      eventType: 'PLAN_COMPLETED',
      planId: plan._id,
      checkinId: checkin._id,
      title: `${user.nickname || '成员'}完成了「${plan.name}」`,
      summary: '计划已完成',
      createdAt: now()
    } })
  }))
}

module.exports = { friendshipBetween, isGroupMember, emitGroupEventsForCheckin }
