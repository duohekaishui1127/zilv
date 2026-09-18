const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { trimNotificationHistory } = require('./notification-retention')
const { invitationId } = require('../domain/group-invitation')

async function sendGroupInvitation(recipientId, actor, group) {
  const timestamp = now()
  const id = invitationId(group._id, recipientId, timestamp)
  const existing = await db.collection(C.NOTIFICATIONS).doc(id).get().then(x => x.data).catch(() => null)
  if (existing) return 'duplicate'
  const groupName = encodeURIComponent(String(group.name || '群组').slice(0, 80))
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data: {
    userId: recipientId,
    type: 'GROUP_INVITATION',
    title: '收到群组邀请',
    content: `${actor.nickname || '一位用户'}邀请你加入「${group.name || '群组'}」`,
    actorUserId: actor._id,
    groupId: group._id,
    inviteCode: group.inviteCode,
    page: `/pages/circle/groups?inviteCode=${group.inviteCode}&inviteName=${groupName}`,
    status: 'UNREAD',
    pushStatus: 'INTERNAL_ONLY',
    createdAt: timestamp,
    updatedAt: timestamp
  } })
  await trimNotificationHistory(recipientId)
  return 'sent'
}

module.exports = { sendGroupInvitation }
