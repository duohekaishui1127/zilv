const { isDefaultAdminFriendship } = require('./default-admin-friend')

function otherUserId(friendship, userId) {
  if (!friendship) return ''
  if (String(friendship.userA || '') === String(userId || '')) return String(friendship.userB || '')
  if (String(friendship.userB || '') === String(userId || '')) return String(friendship.userA || '')
  return ''
}

function timestampOf(friendship) {
  const value = friendship?.updatedAt || friendship?.acceptedAt || friendship?.requestedAt || friendship?.createdAt
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function friendshipRank(friendship) {
  let rank = 0
  if (friendship?.status === 'ACCEPTED') rank += 30
  else if (friendship?.status === 'PENDING') rank += 20
  if (rank && isDefaultAdminFriendship(friendship)) rank += 100
  return rank
}

function preferredFriendship(friendships) {
  return [...(friendships || [])].sort((a, b) => {
    const rankDifference = friendshipRank(b) - friendshipRank(a)
    if (rankDifference) return rankDifference
    const timeDifference = timestampOf(b) - timestampOf(a)
    if (timeDifference) return timeDifference
    return String(a?._id || '').localeCompare(String(b?._id || ''))
  })[0] || null
}

function uniqueFriendshipsForUser(friendships, userId) {
  const grouped = new Map()
  for (const friendship of friendships || []) {
    const otherId = otherUserId(friendship, userId)
    if (!otherId || otherId === String(userId || '')) continue
    if (!grouped.has(otherId)) grouped.set(otherId, [])
    grouped.get(otherId).push(friendship)
  }
  return [...grouped.values()].map(preferredFriendship).filter(Boolean)
}

module.exports = {
  otherUserId,
  preferredFriendship,
  uniqueFriendshipsForUser
}
