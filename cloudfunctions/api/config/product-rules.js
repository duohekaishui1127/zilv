const DEFAULTS = Object.freeze({
  betaEnrollmentEnabled: true,
  betaProDays: 90,
  proPurchaseEnabled: false,
  proLifetimePrice: 39.9,
  makeupFreeCap: 3,
  makeupProCap: 6,
  makeupFreeMonthlyGrant: 1,
  makeupProMonthlyGrant: 2
})

function boolValue(value, fallback) {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1','true','yes','on'].includes(normalized)) return true
  if (['0','false','no','off'].includes(normalized)) return false
  return fallback
}

function intValue(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function numberValue(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function productRules(env = process.env) {
  const freeCap = intValue(env.MAKEUP_FREE_CARD_CAP, DEFAULTS.makeupFreeCap, 0, 99)
  const proCap = intValue(env.MAKEUP_PRO_CARD_CAP, DEFAULTS.makeupProCap, freeCap, 99)
  return {
    betaEnrollmentEnabled: boolValue(env.BETA_ENROLLMENT_ENABLED, DEFAULTS.betaEnrollmentEnabled),
    betaProDays: intValue(env.BETA_PRO_DAYS, DEFAULTS.betaProDays, 1, 365),
    proPurchaseEnabled: boolValue(env.PRO_PURCHASE_ENABLED, DEFAULTS.proPurchaseEnabled),
    proLifetimePrice: numberValue(env.PRO_LIFETIME_PRICE, DEFAULTS.proLifetimePrice, 0, 9999),
    makeup: {
      free: {
        cap: freeCap,
        monthlyGrant: intValue(env.MAKEUP_FREE_MONTHLY_GRANT, DEFAULTS.makeupFreeMonthlyGrant, 0, freeCap)
      },
      pro: {
        cap: proCap,
        monthlyGrant: intValue(env.MAKEUP_PRO_MONTHLY_GRANT, DEFAULTS.makeupProMonthlyGrant, 0, proCap)
      }
    }
  }
}

function publicProductRules(env = process.env) {
  const rules = productRules(env)
  return {
    beta: {
      enrollmentEnabled: rules.betaEnrollmentEnabled,
      trialDays: rules.betaProDays
    },
    recovery: {
      free: { ...rules.makeup.free },
      pro: { ...rules.makeup.pro }
    },
    pro: {
      purchaseEnabled: rules.proPurchaseEnabled,
      lifetimePrice: rules.proLifetimePrice
    }
  }
}

module.exports = { DEFAULTS, productRules, publicProductRules, boolValue, intValue, numberValue }
