const crypto = require('crypto')
const { cloud, db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { getUserById } = require('./users')
const { visibilityFor, canSharePlanWithFriend } = require('./friend-visibility')
const { trimNotificationHistory } = require('./notification-retention')

function text(value, max = 20) { return String(value || '').trim().slice(0, max) }

async function document(collection, id) {
  try { return (await db.collection(collection).doc(id).get()).data } catch (error) { return null }
}

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

function socialNotificationConfig() {
  const templateId = String(process.env.SOCIAL_CHECKIN_TEMPLATE_ID || '').trim()
  return { configured: !!templateId, templateId, subscriptionType: 'ONE_TIME' }
}

function notificationId(recipientId, checkin) {
  return crypto.createHash('sha256')
    .update(`social:${recipientId}:${checkin._id}:${Number(checkin.completionVersion || 1)}`)
    .digest('hex').slice(0, 32)
}

function socialTemplateData(actor, plan, checkin) {
  const memberKey = process.env.SOCIAL_TEMPLATE_MEMBER_KEY || 'thing1'
  const planKey = process.env.SOCIAL_TEMPLATE_PLAN_KEY || 'thing2'
  const timeKey = process.env.SOCIAL_TEMPLATE_TIME_KEY || 'time3'
  const completedAt = checkin.completedAt instanceof Date ? checkin.completedAt : new Date(checkin.completedAt || Date.now())
  const hh = String(completedAt.getHours()).padStart(2, '0')
  const mm = String(completedAt.getMinutes()).padStart(2, '0')
  return {
    [memberKey]: { value: text(actor.nickname || '好友', 20) },
    [planKey]: { value: text(plan.name, 20) },
    [timeKey]: { value: `${checkin.date} ${hh}:${mm}` }
  }
}

async function clearWechatSources(sources) {
  await Promise.all(sources.map(source => db.collection(source.collection).doc(source.id).update({
    data: { [source.field]: false, updatedAt: now() }
  }).catch(() => null)))
}

async function sendSocialWechat(notification, recipient, actor, plan, checkin, sources) {
  if (!sources.length) return
  const config = socialNotificationConfig()
  if (!config.configured) {
    await db.collection(C.NOTIFICATIONS).doc(notification._id).update({ data: { pushStatus: 'NOT_CONFIGURED', updatedAt: now() } })
    return
  }
  if (!recipient?.openid) return
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: recipient.openid, templateId: config.templateId, page: notification.page.replace(/^\//, ''),
      miniprogramState: process.env.SOCIAL_MINIPROGRAM_STATE || 'formal', lang: 'zh_CN',
      data: socialTemplateData(actor, plan, checkin)
    })
    const code = Number(result.errCode ?? result.errcode ?? 0)
    if (code !== 0) throw Object.assign(new Error(result.errMsg || result.errmsg || '订阅消息发送失败'), result)
    await db.collection(C.NOTIFICATIONS).doc(notification._id).update({ data: { pushStatus: 'SENT', pushedAt: now(), updatedAt: now() } })
    await clearWechatSources(sources)
  } catch (error) {
    const code = Number(error?.errCode ?? error?.errcode ?? error?.code) || 'SEND_FAILED'
    await db.collection(C.NOTIFICATIONS).doc(notification._id).update({ data: {
      pushStatus: code === 43101 ? 'NOT_SUBSCRIBED' : 'FAILED', pushErrorCode: code,
      pushErrorMessage: text(error?.errMsg || error?.message || '发送失败', 120), updatedAt: now()
    } })
    if (code === 43101) await clearWechatSources(sources)
  }
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
      if (member.wechatCheckinEnabled) entry.sources.push({ collection: C.GROUP_MEMBERS, id: member._id, field: 'wechatCheckinEnabled' })
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
        createdAt: now(), updatedAt: now()
      }
      await db.collection(C.NOTIFICATIONS).doc(id).set({ data })
      notification = { _id: id, ...data }
      await trimNotificationHistory(entry.userId)
    }
    await sendSocialWechat(notification, await getUserById(entry.userId), actor, plan, checkin, entry.sources)
  }))
}

async function emitGroupEventsForCheckin(actor, plan, checkin) {
  const recipients = new Map()
  await addGroupEventsAndRecipients(actor, plan, checkin, recipients)
  await addSpecialCareRecipients(actor, plan, recipients)
  await notifyRecipients(recipients, actor, plan, checkin)
}

async function emitGroupEventsForRevocation(actor, plan, checkin) {
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
