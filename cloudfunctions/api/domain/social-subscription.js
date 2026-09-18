function normalizeSocialSubscriptionType(value) {
  return String(value || '').toUpperCase() === 'LONG_TERM' ? 'LONG_TERM' : 'ONE_TIME'
}

function shouldConsumeSocialSubscription(subscriptionType, errorCode = 0) {
  if (Number(errorCode) === 43101) return true
  return normalizeSocialSubscriptionType(subscriptionType) !== 'LONG_TERM'
}

module.exports = { normalizeSocialSubscriptionType, shouldConsumeSocialSubscription }
