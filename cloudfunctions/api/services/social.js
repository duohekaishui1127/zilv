const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { visibilityFor, canSharePlanWithFriend } = require('./friend-visibility')
const { trimNotificationHistory } = require('./notification-retention')
const { normalizeSocialSubscriptionType } = require('../domain/social-subscription')
const { preferredFriendship } = require('../domain/friendship-dedup')

function text(value, max = 20) { return String(value || '').trim().slice(0, max) }

async function document(collection, id) {
  try { return (await db.collection(collection).doc(id).get()).data } catch (error) { return null }
}

async function friendshipBetween(a, b) {
  const [ab, ba] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: a, userB: b }).limit(100).get(),
    db.collection(C.FRIENDSHIPS).where({ userA: b, userB: a }).limit(100).get()
  ])
  return preferredFriendship([...ab.data, ...ba.data])
}

async function isGroupMember(groupId, userId) {
  const r = await db.collection(C.GROUP_MEMBERS).where({ groupId, userId, status: 'ACTIVE' }).limit(1).get()
  return r.data[0] || null
}

function socialNotificationConfig() {
  const templateId = String(process.env.SOCIAL_CHECKIN_TEMPLATE_ID || '').trim()
  const subscriptionType = normalizeSocialSubscriptionType(process.env.SOCIAL_CHECKIN_SUBSCRIPTION_TYPE)
  return { configured: !!templateId, templateId, subscriptionType }
}

function notificationId(recipientId, checkin) {
  return crypto.createHash('sha256')
    .update(`social:${recipientId}:${checkin._id}:${Number(checkin.completionVersion || 1)}`)
    .digest('hex').slice(0, 32)
}

function recipientEntry(recipients, userId) {
  if (!recipients.has(userId)) recipients.set(userId, { userId, groupIds: [], sources: [], specialCare: false })
  return recipients.get(userId)
}

async function addGroupEventsAndRecipients(actor, plan, checkin, recipients) {
  const bindings = await db.collection(C.PLAN_GROUPS).where({ userId: actor._id, planId: plan._id, enabled: true }).get()
  await Promise.all(bindings.data.map(async binding => {
    if (!(await isGroupMember(binding.groupId, actor._id))) return
    const version = Number(checkin.completionVersion || 1)
    const exists = await db.collection(C.GROUP_EVENTS).where({
      groupId: binding.groupId, checkinId: checkin._id,
      eventType: 'PLAN_COMPLETED', completionVersion: version
    }).limit(1).get()
    if (!exists.data.length) await db.collection(C.GROUP_EVENTS).add({ data: {
      groupId: binding.groupId, userId: actor._id, eventType: 'PLAN_COMPLETED',
      planId: plan._id, checkinId: checkin._id, completionVersion: version,
      title: `${actor.nickname || '成员'}完成了「${plan.name}」`, summary: '计划已完成',
      status: 'ACTIVE', likeCount: 0, createdAt: now(), updatedAt: now()
    } })
    const members = await db.collection(C.GROUP_MEMBERS).where({ groupId: binding.groupId, status: 'ACTIVE' }).get()
    members.data.filter(member => member.userId !== actor._id).forEach(member => {
      const entry = recipientEntry(recipients, member.userId)
      if (!entry.groupIds.includes(binding.groupId)) entry.groupIds.push(binding.groupId)
    })
  }))
}

async function addSpecialCareRecipients(actor, plan, recipients) {
  const result = await db.collection(C.SPECIAL_CARES).where({ targetUserId: actor._id, enabled: true }).get()
  await Promise.all(result.data.map(async care => {
    const friendship = await friendshipBetween(care.userId, actor._id)
    if (!friendship || friendship.status !== 'ACCEPTED') return
    const visibility = await visibilityFor(actor._id, care.userId)
    if (!canSharePlanWithFriend(plan, visibility.effective)) return
    const entry = recipientEntry(recipients, care.userId)
    entry.specialCare = true
    if (care.wechatEnabled) entry.sources.push({ collection: C.SPECIAL_CARES, id: care._id, field: 'wechatEnabled' })
  }))
}

async function notifyRecipients(recipients, actor, plan, checkin) {
  await Promise.all([...recipients.values()].map(async entry => {
    const id = notificationId(entry.userId, checkin)
    let notification = await document(C.NOTIFICATIONS, id)
    const page = entry.groupIds.length ? `/pages/circle/group-detail?id=${entry.groupIds[0]}` : '/pages/circle/index'
    if (!notification) {
      const data = {
        userId: entry.userId, type: 'SOCIAL_CHECKIN', title: `${actor.nickname || '好友'}刚刚完成了一项计划`,
        content: `完成了「${text(plan.name, 60)}」`, actorUserId: actor._id, planId: plan._id,
        checkinId: checkin._id, completionVersion: Number(checkin.completionVersion || 1),
        groupIds: entry.groupIds, specialCare: entry.specialCare, page,
        status: 'UNREAD', pushStatus: entry.sources.length ? 'PENDING' : 'NOT_SUBSCRIBED',
        pushSources:entry.sources,
        createdAt: now(), updatedAt: now()
      }
      await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
      notification = { _id: id, ...data }
      await trimNotificationHistory(entry.userId)
    }
  }))
}

async function emitGroupEventsForCheckin(actor, plan, checkin) {
  if (plan?.planType === 'LONG_TERM') return
  const recipients = new Map()
  await addGroupEventsAndRecipients(actor, plan, checkin, recipients)
  await addSpecialCareRecipients(actor, plan, recipients)
  await notifyRecipients(recipients, actor, plan, checkin)
}

async function emitGroupEventsForRevocation(actor, plan, checkin) {
  if (plan?.planType === 'LONG_TERM') return
  const bindings = await db.collection(C.PLAN_GROUPS).where({ userId: actor._id, planId: plan._id, enabled: true }).get()
  const version = Number(checkin.completionVersion || 1)
  await Promise.all(bindings.data.map(async binding => {
    if (!(await isGroupMember(binding.groupId, actor._id))) return
    const completed = await db.collection(C.GROUP_EVENTS).where({
      groupId: binding.groupId, checkinId: checkin._id, eventType: 'PLAN_COMPLETED'
    }).get()
    const matching = completed.data.filter(item => Number(item.completionVersion || 1) === version && item.status !== 'REVOKED')
    await Promise.all(matching.map(item => db.collection(C.GROUP_EVENTS).doc(item._id).update({
      data: { status: 'REVOKED', summary: '已撤回完成状态', updatedAt: now() }
    })))
    const exists = await db.collection(C.GROUP_EVENTS).where({
      groupId: binding.groupId, checkinId: checkin._id,
      eventType: 'PLAN_REVOKED', completionVersion: version
    }).limit(1).get()
    if (!exists.data.length) await db.collection(C.GROUP_EVENTS).add({ data: {
      groupId: binding.groupId, userId: actor._id, eventType: 'PLAN_REVOKED', planId: plan._id,
      checkinId: checkin._id, completionVersion: version, title: `${actor.nickname || '成员'}撤回了「${plan.name}」`,
      summary: '完成状态已更新', status: 'ACTIVE', likeCount: 0, createdAt: now(), updatedAt: now()
    } })
  }))
  await db.collection(C.NOTIFICATIONS).where({
    checkinId: checkin._id,
    completionVersion: version,
    type: 'SOCIAL_CHECKIN'
  }).update({ data: {
    title: `${actor.nickname || '好友'}撤回了一项完成`,
    content: `「${text(plan.name, 60)}」的完成状态已撤回`,
    socialStatus: 'REVOKED',
    updatedAt: now()
  } }).catch(error => console.warn('[social-revoke-notifications]', error?.message || error))
}

module.exports = {
  friendshipBetween, isGroupMember, socialNotificationConfig,
  emitGroupEventsForCheckin, emitGroupEventsForRevocation
}
