const { APP_VERSION, SCHEMA_VERSION, NUTRITION_ALGORITHM_VERSION } = require('../lib/version')

async function getSystemInfo() {
  return {
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    nutritionAlgorithmVersion: NUTRITION_ALGORITHM_VERSION,
    serverTime: new Date().toISOString()
  }
}

module.exports = { getSystemInfo }
