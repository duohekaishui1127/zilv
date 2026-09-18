const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { trimNotificationHistory } = require('./notification-retention')

function idOf(type, recipientId, friendship) {
  const version = Number(friendship.requestVersion || 1)
  return crypto.createHash('sha256').update(`${type}:${recipientId}:${friendship._id}:${version}`).digest('hex').slice(0, 32)
}

async function createFriendNotification(type, recipientId, friendship, actor, title, content, page = '/pages/circle/friends') {
  const id = idOf(type, recipientId, friendship)
  const timestamp = now()
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data: {
    userId: recipientId,
    type,
    friendshipId: friendship._id,
    actorUserId: actor._id,
    title,
    content,
    page,
    status: 'UNREAD',
    pushStatus: 'INTERNAL_ONLY',
    createdAt: timestamp,
    updatedAt: timestamp
  } })
  await trimNotificationHistory(recipientId)
}

async function notifyFriendRequest(recipientId, friendship, actor) {
  return createFriendNotification('FRIEND_REQUEST', recipientId, friendship, actor, '新的好友申请', `${actor.nickname || '一位用户'}申请添加你为好友`)
}

async function notifyFriendAccepted(recipientId, friendship, actor) {
  return createFriendNotification(
    'FRIEND_ACCEPTED', recipientId, friendship, actor,
    '好友申请已通过', `${actor.nickname || '对方'}已同意你的好友申请`,
    `/pages/circle/friend-detail?id=${actor._id}`
  )
}

async function notifyFriendRejected(recipientId, friendship, actor) {
  return createFriendNotification('FRIEND_REJECTED', recipientId, friendship, actor, '好友申请未通过', `${actor.nickname || '对方'}暂未同意你的好友申请`)
}

async function resolveFriendRequestNotification(recipientId, friendshipId, resolution) {
  const result = await db.collection(C.NOTIFICATIONS).where({
    userId: recipientId, friendshipId, type: 'FRIEND_REQUEST'
  }).get()
  const labels = { ACCEPTED: '好友申请已接受', REJECTED: '好友申请已拒绝', CANCELLED: '好友申请已由对方撤回' }
  await Promise.all(result.data.map(item => db.collection(C.NOTIFICATIONS).doc(item._id).update({ data: {
    status: 'READ', resolution, content: labels[resolution] || item.content, readAt: now(), updatedAt: now()
  } })))
}

module.exports = { notifyFriendRequest, notifyFriendAccepted, notifyFriendRejected, resolveFriendRequestNotification }
