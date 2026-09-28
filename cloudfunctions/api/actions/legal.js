const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const { legalConfig, legalAccepted, acceptanceFields } = require('../domain/legal')
const { membershipOf } = require('../domain/membership')
const { entitlementsOf } = require('../domain/entitlements')
const { proOffer } = require('../domain/pro-offer')
const { publicProductRules } = require('../config/product-rules')

async function getLegalGate({ user }) {
  const config = legalConfig()
  return {
    ...config,
    accepted: Boolean(user && legalAccepted(user)),
    acceptedAt: user?.legalAcceptedAt || null
  }
}

async function acceptLegal({ user, event }) {
  if (event.accepted !== true) throw fail('LEGAL_CONSENT_REQUIRED', '需要同意用户协议与隐私政策后继续使用')
  const config = legalConfig()
  if (String(event.termsVersion || '') !== config.termsVersion || String(event.privacyVersion || '') !== config.privacyVersion) {
    throw fail('LEGAL_VERSION_MISMATCH', '协议版本已更新，请重新阅读后确认')
  }
  const data = acceptanceFields(now())
  await db.collection(C.USERS).doc(user._id).update({ data })
  return { accepted: true, ...config, acceptedAt: data.legalAcceptedAt }
}

async function getMembershipOverview({ user }) {
  const membership = membershipOf(user)
  return { membership, entitlements: entitlementsOf(membership), offer: proOffer(), rules: publicProductRules() }
}

module.exports = { getLegalGate, acceptLegal, getMembershipOverview }
