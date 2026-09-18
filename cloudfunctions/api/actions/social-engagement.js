const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { getUserById, getPrivacy } = require('../services/users')
const { friendshipBetween, isGroupMember, socialNotificationConfig } = require('../services/social')

async function setGroupWechatNotification({ user, event }) {
  const member = await isGroupMember(event.groupId, user._id)
  if (!member) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const enabled = Boolean(event.enabled && event.grantAccepted)
  await db.collection(C.GROUP_MEMBERS).doc(member._id).update({ data: {
    wechatCheckinEnabled: enabled,
    wechatAuthorizedAt: enabled ? now() : (member.wechatAuthorizedAt || null),
    updatedAt: now()
  } })
  return { enabled }
}

async function toggleGroupEventLike({ user, event }) {
  const groupEvent = await db.collection(C.GROUP_EVENTS).doc(event.eventId).get().then(x => x.data).catch(() => null)
  if (!groupEvent || !(await isGroupMember(groupEvent.groupId, user._id))) throw fail('GROUP_PERMISSION_DENIED', '无权操作该动态')
  if (groupEvent.eventType !== 'PLAN_COMPLETED' || groupEvent.status === 'REVOKED') throw fail('INVALID_PARAMETER', '这条动态暂不能点赞')
  const result = await db.collection(C.GROUP_EVENT_LIKES).where({ eventId: groupEvent._id, userId: user._id }).limit(1).get()
  let liked
  if (result.data.length) {
    await db.collection(C.GROUP_EVENT_LIKES).doc(result.data[0]._id).remove()
    liked = false
  } else {
    await db.collection(C.GROUP_EVENT_LIKES).add({ data: {
      eventId: groupEvent._id, groupId: groupEvent.groupId, userId: user._id, createdAt: now()
    } })
    liked = true
  }
  const count = await db.collection(C.GROUP_EVENT_LIKES).where({ eventId: groupEvent._id }).count()
  await db.collection(C.GROUP_EVENTS).doc(groupEvent._id).update({ data: { likeCount: count.total, updatedAt: now() } })
  return { liked, likeCount: count.total }
}

async function specialCareOf(userId, targetUserId) {
  const result = await db.collection(C.SPECIAL_CARES).where({ userId, targetUserId }).limit(1).get()
  return result.data[0] || null
}

async function assertFriend(userId, targetUserId) {
  const friendship = await friendshipBetween(userId, targetUserId)
  if (!friendship || friendship.status !== 'ACCEPTED') throw fail('NOT_FOUND', '好友关系不存在')
}

async function setSpecialCare({ user, event }) {
  await assertFriend(user._id, event.targetUserId)
  const existing = await specialCareOf(user._id, event.targetUserId)
  const enabled = Boolean(event.enabled)
  const data = { enabled, wechatEnabled: enabled ? Boolean(existing?.wechatEnabled) : false, updatedAt: now() }
  if (existing) await db.collection(C.SPECIAL_CARES).doc(existing._id).update({ data })
  else await db.collection(C.SPECIAL_CARES).add({ data: {
    userId: user._id, targetUserId: event.targetUserId, ...data, createdAt: now()
  } })
  return data
}

async function setSpecialCareWechat({ user, event }) {
  await assertFriend(user._id, event.targetUserId)
  const existing = await specialCareOf(user._id, event.targetUserId)
  if (!existing?.enabled) throw fail('INVALID_PARAMETER', '请先设为特别关心')
  const enabled = Boolean(event.enabled && event.grantAccepted)
  await db.collection(C.SPECIAL_CARES).doc(existing._id).update({ data: {
    wechatEnabled: enabled, wechatAuthorizedAt: enabled ? now() : (existing.wechatAuthorizedAt || null), updatedAt: now()
  } })
  return { enabled }
}

async function getSocialNotificationConfig() {
  return socialNotificationConfig()
}

async function getSpecialCareFeed({ user }) {
  const cares = await db.collection(C.SPECIAL_CARES).where({ userId: user._id, enabled: true }).get()
  const batches = await Promise.all(cares.data.map(async care => {
    const friendship = await friendshipBetween(user._id, care.targetUserId)
    const privacy = await getPrivacy(care.targetUserId)
    if (!friendship || friendship.status !== 'ACCEPTED' || !privacy.showPlanStatusToFriends) return []
    const [target, checkins, plans] = await Promise.all([
      getUserById(care.targetUserId),
      db.collection(C.CHECKINS).where({ userId: care.targetUserId, completed: true }).limit(100).get(),
      db.collection(C.PLANS).where({ userId: care.targetUserId }).limit(100).get()
    ])
    if (!target) return []
    const planMap = new Map(plans.data.map(plan => [plan._id, plan]))
    return checkins.data.map(checkin => ({
      _id: `${checkin._id}-${Number(checkin.completionVersion || 1)}`,
      actorUserId: target._id, nickname: target.nickname, avatar: target.avatar,
      planName: planMap.get(checkin.planId)?.name || '一项计划', category: planMap.get(checkin.planId)?.category || 'CUSTOM',
      date: checkin.date, completedAt: checkin.completedAt
    }))
  }))
  const feed = batches.flat().sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)).slice(0, 50)
  return { feed }
}

module.exports = {
  setGroupWechatNotification, toggleGroupEventLike, setSpecialCare,
  setSpecialCareWechat, getSocialNotificationConfig, getSpecialCareFeed
}
