const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { getUserById } = require('../services/users')
const { getTodayPlans } = require('../services/plans')
const { friendshipBetween } = require('../services/social')
const { friendSettingsOf, visibilityFor, canSharePlanWithFriend } = require('../services/friend-visibility')
const { notifyFriendRequest, notifyFriendAccepted, resolveFriendRequestNotification } = require('../services/friend-notifications')
const { normalizeFriendRequestMessage } = require('../domain/friend-request')

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
  if (existing && ['PENDING', 'ACCEPTED'].includes(existing.status)) return { friendship: existing, duplicate: true }
  const sameRequester = existing?.requestedBy === user._id
  const rejectedAt = new Date(existing?.rejectedAt || 0).getTime()
  const cancelledAt = new Date(existing?.cancelledAt || 0).getTime()
  if (sameRequester && existing?.status === 'REJECTED' && Date.now() - rejectedAt < 24 * 60 * 60 * 1000) {
    throw fail('FRIEND_REQUEST_COOLDOWN', '对方暂未同意，请稍后再试')
  }
  if (sameRequester && existing?.status === 'CANCELLED' && Date.now() - cancelledAt < 5 * 60 * 1000) {
    throw fail('FRIEND_REQUEST_COOLDOWN', '申请刚刚撤回，请稍后再试')
  }
  const data = {
    userA: user._id, userB: target._id, status: 'PENDING', requestedBy: user._id,
    requestMessage: normalizeFriendRequestMessage(event.requestMessage),
    requestVersion: Number(existing?.requestVersion || 0) + 1, requestedAt: now(), updatedAt: now()
  }
  let friendship
  if (existing) {
    await db.collection(C.FRIENDSHIPS).doc(existing._id).update({ data })
    friendship = { ...existing, ...data }
  } else {
    const base = { ...data, createdAt: now() }
    const add = await db.collection(C.FRIENDSHIPS).add({ data: base })
    friendship = { _id: add._id, ...base }
  }
  await notifyFriendRequest(target._id, friendship, user).catch(error => console.warn('[friend-request-notify]', error?.message || error))
  return { friendship }
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
  const outgoingRows = [...a.data, ...b.data].filter(item => item.requestedBy === user._id)
  const outgoing = await Promise.all(outgoingRows.map(async item => {
    const other = await getUserById(item.userA === user._id ? item.userB : item.userA)
    return other ? { friendship: item, user: publicUser(other) } : null
  }))
  return { requests: requests.filter(Boolean), outgoing: outgoing.filter(Boolean) }
}

async function acceptFriendRequest({ user, event }) {
  const friendship = await db.collection(C.FRIENDSHIPS).doc(event.friendshipId).get().then(x => x.data).catch(() => null)
  const involved = friendship && (friendship.userA === user._id || friendship.userB === user._id)
  if (!friendship || friendship.status !== 'PENDING' || friendship.requestedBy === user._id || !involved) {
    throw fail('FORBIDDEN', '无权处理好友请求')
  }
  const data = { status: 'ACCEPTED', acceptedAt: now(), updatedAt: now() }
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).update({ data })
  await resolveFriendRequestNotification(user._id, friendship._id, 'ACCEPTED').catch(() => null)
  const requesterId = friendship.requestedBy
  await notifyFriendAccepted(requesterId, { ...friendship, ...data }, user).catch(error => console.warn('[friend-accept-notify]', error?.message || error))
  return { accepted: true }
}

async function removeFriend({ user, event }) {
  const friendship = await friendshipBetween(user._id, event.friendUserId)
  if (!friendship || friendship.status !== 'ACCEPTED') throw fail('NOT_FOUND', '好友关系不存在')
  await db.collection(C.FRIENDSHIPS).doc(friendship._id).remove()
  const [mine, theirs] = await Promise.all([
    db.collection(C.SPECIAL_CARES).where({ userId: user._id, targetUserId: event.friendUserId }).get(),
    db.collection(C.SPECIAL_CARES).where({ userId: event.friendUserId, targetUserId: user._id }).get()
  ])
  await Promise.all([...mine.data, ...theirs.data].map(care => db.collection(C.SPECIAL_CARES).doc(care._id).update({
    data: { enabled: false, wechatEnabled: false, updatedAt: now() }
  })))
  const [mySettings, theirSettings] = await Promise.all([
    db.collection(C.FRIEND_SETTINGS).where({ userId: user._id, friendUserId: event.friendUserId }).get(),
    db.collection(C.FRIEND_SETTINGS).where({ userId: event.friendUserId, friendUserId: user._id }).get()
  ])
  await Promise.all([...mySettings.data, ...theirSettings.data].map(item => db.collection(C.FRIEND_SETTINGS).doc(item._id).remove()))
  return { removed: true }
}

async function getFriends({ user, localDate }) {
  const [a, b, cares] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: user._id, status: 'ACCEPTED' }).get(),
    db.collection(C.FRIENDSHIPS).where({ userB: user._id, status: 'ACCEPTED' }).get(),
    db.collection(C.SPECIAL_CARES).where({ userId: user._id }).get()
  ])
  const careMap = new Map(cares.data.map(item => [item.targetUserId, item]))
  const friends = await Promise.all([...a.data, ...b.data].map(async friendship => {
    const other = await getUserById(friendship.userA === user._id ? friendship.userB : friendship.userA)
    if (!other) return null
    const [visibility, mySettings] = await Promise.all([
      visibilityFor(other._id, user._id),
      friendSettingsOf(user._id, other._id)
    ])
    const privacy = visibility.effective
    const allPlans = privacy.showPlanStatusToFriends ? await getTodayPlans(other._id, localDate) : []
    const plans = allPlans.filter(plan => canSharePlanWithFriend(plan, privacy))
    const studyPlans = plans.filter(x => x.category === 'STUDY')
    const workoutPlans = plans.filter(x => x.category === 'WORKOUT')
    const care = careMap.get(other._id)
    return {
      ...publicUser(other),
      remark: mySettings?.remark || '',
      displayName: mySettings?.remark || other.nickname,
      specialCare: Boolean(care?.enabled),
      specialCareWechat: Boolean(care?.enabled && care?.wechatEnabled),
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

module.exports = {
  findUserByShareCode, sendFriendRequest, getFriendRequests, acceptFriendRequest,
  removeFriend, getFriends
}
