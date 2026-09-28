const { loadAchievements } = require('../services/achievements')
const { membershipOf } = require('../domain/membership')

async function getAchievements({ user, localDate }) {
  return {
    ...(await loadAchievements(user, localDate)),
    membership: membershipOf(user),
    identityCode: user.identityCode
  }
}

module.exports = { getAchievements }
