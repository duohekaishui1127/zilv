const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { getUserById, getPrivacy } = require('../services/users')
const { getTodayPlans } = require('../services/plans')
const { friendshipBetween } = require('../services/social')

function publicUser(user) {
  return { _id: user._id, nickname: user.nickname, avatar: user.avatar, shareCode: user.shareCode }
}

async function findUserByShareCode({ user, event }) {
  const code = String(event.shareCode || '').trim().toUpperCase()
  if (!code) throw fail('INVALID_PARAMETER', '请输入好友码')
  const result = await db.collection(C.USERS).where({ shareCode: code, status: 'ACTIVE' }).limit(1).get()
  if (!result.data.length || result.data[0]._id === user._id) throw fail('NOT_FOUND', '未找到其他用户')
  return { user: publicUser(result.data[0]) }
}

async function sendFriendRequest({ user, event }) {
  const target = await getUserById(event.targetUserId)
  if (!target || target._id === user._id) throw fail('INVALID_PARAMETER', '好友目标不合法')
  const existing = await friendshipBetween(user._id, target._id)
  if (existing) return { friendship: existing }
  const data = { userA: user._id, userB: target._id, status: 'PENDING', requestedBy: user._id, createdAt: now(), updatedAt: now() }
  const add = await db.collection(C.FRIENDSHIPS).add({ data })
  return { friendship: { _id: add._id, ...data } }
}

async function getFriendRequests({ user }) {
  const [a, b] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userB: user._id, status: 'PENDING' }).get(),
    db.collection(C.FRIENDSHIPS).where({ userA: user._id, status: 'PENDING' }).get()
  ])
  const incoming = [...a.data, ...b.data].filter(item => item.requestedBy !== user._id)
  const requests = await Promise.all(incoming.map(async item => {
    const other = await getUserById(item.userA === user._id ? item.userB : item.userA)
    return other ? { friendship: item, user: publicUser(other) } : null
  }))
  return { requests: requests.filter(Boolean) }
}

async function acceptFriendRequest({ user, event }) {
  const friendship = await db.collection(C.FRIENDSHIPS).doc(event.friendshipId).get().then(x => x.data).catch(() => null)
  const involved = friendship && (friendship.userA === user._id || friendship.userB === user._id)
  if (!friendship || friendship.status !== 'PENDING' || friendship.requestedBy === user._id || !involved) {
    throw fail('FORBIDDEN', '无权处理好友请求')
  }
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).update({ data: { status: 'ACCEPTED', updatedAt: now() } })
  return { accepted: true }
}

async function removeFriend({ user, event }) {
  const friendship = await friendshipBetween(user._id, event.friendUserId)
  if (!friendship || friendship.status !== 'ACCEPTED') throw fail('NOT_FOUND', '好友关系不存在')
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).remove()
  return { removed: true }
}

async function getFriends({ user, localDate }) {
  const [a, b] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: user._id, status: 'ACCEPTED' }).get(),
    db.collection(C.FRIENDSHIPS).where({ userB: user._id, status: 'ACCEPTED' }).get()
  ])
  const friends = await Promise.all([...a.data, ...b.data].map(async friendship => {
    const other = await getUserById(friendship.userA === user._id ? friendship.userB : friendship.userA)
    if (!other) return null
    const privacy = await getPrivacy(other._id)
    const plans = privacy.showPlanStatusToFriends ? await getTodayPlans(other._id, localDate) : []
    const studyPlans = plans.filter(x => x.category === 'STUDY')
    const workoutPlans = plans.filter(x => x.category === 'WORKOUT')
    return {
      ...publicUser(other),
      planStatus: privacy.showPlanStatusToFriends ? { total: plans.length, completed: plans.filter(x => x.completed).length } : null,
      studyStatus: privacy.showStudyStatusToFriends && privacy.showPlanStatusToFriends
        ? { total: studyPlans.length, completed: studyPlans.filter(x => x.completed).length, done: studyPlans.length > 0 && studyPlans.every(x => x.completed) }
        : null,
      workoutStatus: privacy.showWorkoutStatusToFriends && privacy.showPlanStatusToFriends
        ? { total: workoutPlans.length, completed: workoutPlans.filter(x => x.completed).length, done: workoutPlans.length > 0 && workoutPlans.every(x => x.completed) }
        : null
    }
  }))
  return { friends: friends.filter(Boolean) }
}

module.exports = { findUserByShareCode, sendFriendRequest, getFriendRequests, acceptFriendRequest, removeFriend, getFriends }
