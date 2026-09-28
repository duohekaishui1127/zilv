const { APP_VERSION, SCHEMA_VERSION, NUTRITION_ALGORITHM_VERSION } = require('../lib/version')
const { legalConfig } = require('../domain/legal')
const { proOffer } = require('../domain/pro-offer')

async function getSystemInfo() {
  const legal=legalConfig()
  const offer=proOffer()
  return {
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    nutritionAlgorithmVersion: NUTRITION_ALGORITHM_VERSION,
    legal:{ termsVersion:legal.termsVersion,privacyVersion:legal.privacyVersion,productionReady:legal.productionReady },
    monetization:{ channel:offer.channel,purchaseEnabled:offer.purchaseEnabled,configured:offer.configured },
    serverTime: new Date().toISOString()
  }
}

module.exports = { getSystemInfo }
