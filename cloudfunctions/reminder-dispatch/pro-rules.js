// Kept deployment-local: cloud functions are uploaded independently.
function proActive(user = {}, at = new Date()) {
  return Boolean(user.proLifetime || user.proPermanent ||
    (user.betaUser && new Date(user.betaExpiresAt || 0).getTime() > new Date(at).getTime()))
}

module.exports = { proActive }
