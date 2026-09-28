const BETA_PRO_DAYS = 90
const DAY_MS = 86400000

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value || 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function identityCode(user = {}) {
  if (user.identityCode) return String(user.identityCode)
  const seed = String(user.shareCode || user._id || 'USER').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return `ZL-${seed.slice(0, 8) || 'USER'}`
}

function addDays(value, days) {
  const date = validDate(value) || new Date()
  return new Date(date.getTime() + Number(days || 0) * DAY_MS)
}

function betaEnrollmentFields(user = {}, at = new Date()) {
  if (user.betaUser && user.betaStartedAt && user.betaExpiresAt) {
    return { identityCode: identityCode(user) }
  }
  const startedAt = validDate(at) || new Date()
  return {
    identityCode: identityCode(user),
    betaUser: true,
    betaStartedAt: startedAt,
    betaExpiresAt: addDays(startedAt, BETA_PRO_DAYS),
    proSource: user.proLifetime ? 'LIFETIME' : 'BETA'
  }
}

function membershipOf(user = {}, at = new Date()) {
  const now = validDate(at) || new Date()
  const expiresAt = validDate(user.betaExpiresAt)
  const lifetime = Boolean(user.proLifetime || user.proPermanent)
  const betaActive = Boolean(user.betaUser && expiresAt && expiresAt.getTime() > now.getTime())
  const remainingDays = betaActive ? Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)) : 0
  return {
    identityCode: identityCode(user),
    isPro: lifetime || betaActive,
    lifetime,
    source: lifetime ? 'LIFETIME' : (betaActive ? 'BETA' : 'FREE'),
    betaUser: Boolean(user.betaUser),
    betaActive,
    betaStartedAt: user.betaStartedAt || null,
    betaExpiresAt: user.betaExpiresAt || null,
    remainingDays,
    foundingTester: Boolean(user.betaUser)
  }
}

module.exports = { BETA_PRO_DAYS, identityCode, betaEnrollmentFields, membershipOf, addDays }
