const { db, C } = require('../lib/db')
const { fail } = require('../lib/utils')
const { SCHEMA_VERSION } = require('../lib/version')

let readyCache = false

async function assertSystemReady() {
  if (readyCache) return true
  try {
    const result = await db.collection(C.SYSTEM_META).where({ key: 'schema' }).limit(1).get()
    const schema = result.data[0]
    if (!schema?.initialized || Number(schema.schemaVersion || 0) < SCHEMA_VERSION) {
      throw fail('DATABASE_NOT_INITIALIZED', `数据库需要初始化/升级到 schema v${SCHEMA_VERSION}`)
    }
    readyCache = true
    return true
  } catch (error) {
    if (error?.success === false) throw error
    throw fail('DATABASE_NOT_INITIALIZED', '数据库尚未初始化，请先部署并运行 admin-init 云函数')
  }
}

module.exports = { assertSystemReady }
