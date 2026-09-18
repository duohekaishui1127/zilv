const { db, C } = require('../lib/db')
const { getPrivacy } = require('./users')
const {
  normalizedFriendOverrides, effectiveFriendPrivacy, canSharePlanWithFriend
} = require('../domain/friend-privacy')

async function friendSettingsOf(userId, friendUserId) {
  const result = await db.collection(C.FRIEND_SETTINGS).where({ userId, friendUserId }).limit(1).get()
  return result.data[0] || null
}

async function visibilityFor(ownerUserId, viewerUserId) {
  const [globalPrivacy, settings] = await Promise.all([
    getPrivacy(ownerUserId),
    friendSettingsOf(ownerUserId, viewerUserId)
  ])
  const privacyMode = settings?.privacyMode === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT'
  const overrides = normalizedFriendOverrides(settings?.privacyOverrides)
  const effective = effectiveFriendPrivacy(globalPrivacy, privacyMode, overrides)
  return { globalPrivacy, settings, privacyMode, overrides, effective }
}

module.exports = {
  friendSettingsOf,
  normalizedOverrides: normalizedFriendOverrides,
  visibilityFor,
  canSharePlanWithFriend
}
