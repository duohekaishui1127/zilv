function normalizeFriendRequestMessage(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

function friendRelationshipState(friendship, viewerUserId, targetUserId) {
  if (viewerUserId === targetUserId) return 'SELF'
  if (!friendship || !['PENDING', 'ACCEPTED'].includes(friendship.status)) return 'NONE'
  if (friendship.status === 'ACCEPTED') return 'ACCEPTED'
  return friendship.requestedBy === viewerUserId ? 'PENDING_OUTGOING' : 'PENDING_INCOMING'
}

module.exports = { normalizeFriendRequestMessage, friendRelationshipState }
