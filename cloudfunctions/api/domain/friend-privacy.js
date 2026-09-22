const { DEFAULT_PRIVACY } = require('../lib/constants')

function normalizedFriendOverrides(input) {
  const output = {}
  Object.keys(DEFAULT_PRIVACY).forEach(key => {
    if (input?.[key] !== undefined) output[key] = Boolean(input[key])
  })
  return output
}

function effectiveFriendPrivacy(globalPrivacy, privacyMode, input) {
  if (privacyMode !== 'CUSTOM') return { ...globalPrivacy }
  return { ...globalPrivacy, ...normalizedFriendOverrides(input) }
}

function canSharePlanWithFriend(plan, privacy) {
  if (!privacy?.showPlanStatusToFriends) return false
  if (plan?.planType === 'LONG_TERM') return false
  if (plan?.category === 'STUDY') return Boolean(privacy.showStudyStatusToFriends)
  if (plan?.category === 'WORKOUT') return Boolean(privacy.showWorkoutStatusToFriends)
  return true
}

module.exports = { normalizedFriendOverrides, effectiveFriendPrivacy, canSharePlanWithFriend }
