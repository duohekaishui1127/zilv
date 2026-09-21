const DEFAULT_ADMIN_FRIEND_SOURCE = 'DEFAULT_ADMIN'

function normalizeShareCode(value) {
  return String(value || '').trim().toUpperCase()
}

function configuredDefaultAdminShareCode(primary, feedbackAdminCodes) {
  const direct = normalizeShareCode(primary)
  if (direct) return direct
  return String(feedbackAdminCodes || '')
    .split(',')
    .map(normalizeShareCode)
    .find(Boolean) || ''
}

function isDefaultAdminFriendship(friendship) {
  return Boolean(friendship && (
    friendship.defaultAdmin === true ||
    friendship.protected === true ||
    friendship.source === DEFAULT_ADMIN_FRIEND_SOURCE
  ))
}

function isDefaultAdministrator(friendship, userId) {
  return isDefaultAdminFriendship(friendship) && String(friendship.userA || '') === String(userId || '')
}

function defaultAdminFriendshipData(adminUserId, userId, timestamp, existing = null) {
  return {
    userA: adminUserId,
    userB: userId,
    status: 'ACCEPTED',
    requestedBy: adminUserId,
    acceptedAt: existing?.acceptedAt || timestamp,
    defaultAdmin: true,
    protected: true,
    source: DEFAULT_ADMIN_FRIEND_SOURCE,
    defaultAdminSince: existing?.defaultAdminSince || timestamp,
    updatedAt: timestamp
  }
}

module.exports = {
  DEFAULT_ADMIN_FRIEND_SOURCE,
  configuredDefaultAdminShareCode,
  isDefaultAdminFriendship,
  isDefaultAdministrator,
  defaultAdminFriendshipData
}
