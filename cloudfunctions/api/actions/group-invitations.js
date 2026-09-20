const { db, C } = require('../lib/db')
const { fail } = require('../lib/utils')
const { getUserById } = require('../services/users')
const { isGroupMember } = require('../services/social')
const { friendSettingsOf } = require('../services/friend-visibility')
const { sendGroupInvitation } = require('../services/group-invitations')

async function groupForMember(groupId, userId) {
  if (!(await isGroupMember(groupId, userId))) throw fail('GROUP_PERMISSION_DENIED', '你不是该群成员')
  const group = await db.collection(C.GROUPS).doc(groupId).get().then(x => x.data).catch(() => null)
  if (!group) throw fail('NOT_FOUND', '群组不存在')
  return group
}

async function acceptedFriendIds(userId) {
  const [a, b] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA: userId, status: 'ACCEPTED' }).get(),
    db.collection(C.FRIENDSHIPS).where({ userB: userId, status: 'ACCEPTED' }).get()
  ])
  return [...a.data, ...b.data].map(item => item.userA === userId ? item.userB : item.userA)
}

async function getGroupInviteCandidates({ user, event }) {
  const group = await groupForMember(String(event.groupId || ''), user._id)
  const [friendIds, members] = await Promise.all([
    acceptedFriendIds(user._id),
    db.collection(C.GROUP_MEMBERS).where({ groupId: group._id }).get()
  ])
  const memberIds = new Set(members.data.filter(item => ['ACTIVE','PENDING'].includes(item.status) ||
    (item.status === 'AUTO_REMOVED' && group.blockRejoinAfterAutoRemove !== false) ||
    (item.status === 'KICKED' && item.rejoinBlocked !== false)).map(item => item.userId))
  const friends = await Promise.all(friendIds.filter(id => !memberIds.has(id)).map(async id => {
    const [friend, settings] = await Promise.all([getUserById(id), friendSettingsOf(user._id, id)])
    if (!friend || friend.status !== 'ACTIVE') return null
    return {
      _id: friend._id,
      nickname: friend.nickname,
      shareCode: friend.shareCode,
      remark: settings?.remark || '',
      displayName: settings?.remark || friend.nickname
    }
  }))
  return { group: { _id: group._id, name: group.name }, friends: friends.filter(Boolean) }
}

async function userByPersonalId(personalId) {
  const value = String(personalId || '').trim()
  if (!value) return null
  const byCode = await db.collection(C.USERS).where({ shareCode: value.toUpperCase(), status: 'ACTIVE' }).limit(1).get()
  if (byCode.data.length) return byCode.data[0]
  const byId = await getUserById(value)
  return byId?.status === 'ACTIVE' ? byId : null
}

async function inviteUsersToGroup({ user, event }) {
  const group = await groupForMember(String(event.groupId || ''), user._id)
  const ids = [...new Set((Array.isArray(event.targetUserIds) ? event.targetUserIds : [])
    .map(String).filter(Boolean).slice(0, 20))]
  const personal = await userByPersonalId(event.personalId)
  if (personal) ids.push(personal._id)
  if (!ids.length) throw fail('INVALID_PARAMETER', event.personalId ? '未找到该用户' : '请选择要邀请的人')
  const results = await Promise.all([...new Set(ids)].map(async targetUserId => {
    if (targetUserId === user._id || await isGroupMember(group._id, targetUserId)) return 'skipped'
    const membership = await db.collection(C.GROUP_MEMBERS).where({ groupId:group._id,userId:targetUserId }).limit(1).get()
    const prior = membership.data[0]
    if (prior?.status === 'PENDING' || (prior?.status === 'AUTO_REMOVED' && group.blockRejoinAfterAutoRemove !== false) ||
      (prior?.status === 'KICKED' && prior.rejoinBlocked !== false)) return 'skipped'
    const target = await getUserById(targetUserId)
    if (!target || target.status !== 'ACTIVE') return 'skipped'
    return sendGroupInvitation(targetUserId, user, group)
  }))
  return {
    sent: results.filter(item => item === 'sent').length,
    duplicate: results.filter(item => item === 'duplicate').length,
    skipped: results.filter(item => item === 'skipped').length
  }
}

module.exports = { getGroupInviteCandidates, inviteUsersToGroup }
