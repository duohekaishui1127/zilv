const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { notifyFriendRejected, resolveFriendRequestNotification } = require('../services/friend-notifications')

async function getFriendRequestSummary({ user }) {
  const [a, b] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: user._id, status: 'PENDING' }).get(),
    db.collection(C.FRIENDSHIPS).where({ userB: user._id, status: 'PENDING' }).get()
  ])
  return { pendingCount: [...a.data, ...b.data].filter(item => item.requestedBy !== user._id).length }
}

async function rejectFriendRequest({ user, event }) {
  const friendship = await db.collection(C.FRIENDSHIPS).doc(event.friendshipId).get().then(x => x.data).catch(() => null)
  const involved = friendship && (friendship.userA === user._id || friendship.userB === user._id)
  if (!friendship || friendship.status !== 'PENDING' || friendship.requestedBy === user._id || !involved) throw fail('FORBIDDEN', '无权处理好友请求')
  const data = { status: 'REJECTED', rejectedAt: now(), updatedAt: now() }
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).update({ data })
  await resolveFriendRequestNotification(user._id, friendship._id, 'REJECTED').catch(() => null)
  await notifyFriendRejected(friendship.requestedBy, { ...friendship, ...data }, user).catch(error => console.warn('[friend-reject-notify]', error?.message || error))
  return { rejected: true }
}

async function cancelFriendRequest({ user, event }) {
  const friendship = await db.collection(C.FRIENDSHIPS).doc(event.friendshipId).get().then(x => x.data).catch(() => null)
  if (!friendship || friendship.status !== 'PENDING' || friendship.requestedBy !== user._id) throw fail('FORBIDDEN', '无权撤回该申请')
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).update({ data: { status: 'CANCELLED', cancelledAt: now(), updatedAt: now() } })
  const recipientId = friendship.userA === user._id ? friendship.userB : friendship.userA
  await resolveFriendRequestNotification(recipientId, friendship._id, 'CANCELLED').catch(() => null)
  return { cancelled: true }
}

module.exports = { getFriendRequestSummary, rejectFriendRequest, cancelFriendRequest }
