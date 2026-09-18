const cloud = require('wx-server-sdk')
const { foods, exercises, bodyMetrics, appConfig } = require('./seed-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const APP_VERSION = '1.6.0'
const SCHEMA_VERSION = 9

const collections = [
  'users','body_records','nutrition_profiles','nutrition_targets','foods','meals','meal_items',
  'workout_sessions','plans','checkins','study_sessions','friendships','privacy_settings','groups',
  'group_members','plan_group_bindings','group_events','exercises','body_metric_defs','app_config',
  'system_meta','audit_logs','migration_history','notes','note_attachments','body_metric_preferences',
  'notifications','feedbacks','daily_reviews','group_event_likes','special_cares','friend_settings'
]

const migrations = [
  { migrationId: '001_core_baseline', schemaVersion: 1, description: '核心业务集合基线' },
  { migrationId: '002_engineering_foundation', schemaVersion: 2, description: '工程化、系统数据初始化、日志与版本管理' },
  { migrationId: '003_notes_quality', schemaVersion: 3, description: '日志/笔记与图片附件、模块边界及质量属性优化' },
  { migrationId: '004_plan_reminders', schemaVersion: 4, description: '计划提醒、站内消息与微信订阅消息状态' },
  { migrationId: '005_feedback_and_announcements', schemaVersion: 5, description: '用户反馈、作者处理状态与版本更新广播' },
  { migrationId: '006_plan_focus_timer', schemaVersion: 6, description: '计划正计时、倒计时及有效时间统计' },
  { migrationId: '007_daily_review_and_meal_timeline', schemaVersion: 7, description: '整日心情打卡、进食时间流与照片记录' },
  { migrationId: '008_social_encouragement', schemaVersion: 8, description: '群组点赞、微信打卡提醒、好友特别关心与撤回同步' },
  { migrationId: '009_friend_profiles', schemaVersion: 9, description: '好友资料、备注、单好友隐私例外与申请通知' }
]

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
    return { name, created: false }
  } catch (error) {
    try {
      await db.createCollection(name)
      return { name, created: true }
    } catch (createError) {
      await db.collection(name).limit(1).get()
      return { name, created: false }
    }
  }
}

async function upsert(collectionName, where, data) {
  const result = await db.collection(collectionName).where(where).limit(1).get()
  const timestamp = new Date()
  if (result.data.length) {
    await db.collection(collectionName).doc(result.data[0]._id).update({ data: { ...data, updatedAt: timestamp } })
    return 'updated'
  }
  await db.collection(collectionName).add({ data: { ...data, createdAt: timestamp, updatedAt: timestamp } })
  return 'inserted'
}

async function seedMany(collectionName, items, keyBuilder) {
  let inserted = 0
  let updated = 0
  for (const item of items) {
    const result = await upsert(collectionName, keyBuilder(item), item)
    if (result === 'inserted') inserted++
    else updated++
  }
  return { inserted, updated, total: items.length }
}

exports.main = async (event = {}) => {
  const configuredToken = process.env.ADMIN_INIT_TOKEN
  if (configuredToken && event.token !== configuredToken) {
    return { success: false, code: 'FORBIDDEN', message: '初始化令牌不正确' }
  }

  const schema = await db.collection('system_meta').where({ key: 'schema' }).limit(1).get()
    .then(result => result.data[0] || null)
    .catch(() => null)
  const currentSchemaVersion = Number(schema?.schemaVersion || 0)
  const isIncrementalUpgrade = currentSchemaVersion >= 4
  const collectionsToEnsure = isIncrementalUpgrade ? ['feedbacks', 'daily_reviews', 'group_event_likes', 'special_cares', 'friend_settings'] : collections
  const collectionResults = []
  for (const name of collectionsToEnsure) collectionResults.push(await ensureCollection(name))

  const skippedSeed = items => ({ inserted: 0, updated: 0, total: items.length, skipped: true })
  const [foodResult, exerciseResult, metricResult, configResult] = isIncrementalUpgrade
    ? [skippedSeed(foods), skippedSeed(exercises), skippedSeed(bodyMetrics), skippedSeed(appConfig)]
    : await Promise.all([
      seedMany('foods', foods, item => ({ ownerType: 'SYSTEM', name: item.name })),
      seedMany('exercises', exercises, item => ({ key: item.key })),
      seedMany('body_metric_defs', bodyMetrics, item => ({ code: item.code })),
      seedMany('app_config', appConfig, item => ({ key: item.key }))
    ])

  for (const migration of migrations) {
    await upsert('migration_history', { migrationId: migration.migrationId }, migration)
  }

  await upsert('system_meta', { key: 'schema' }, {
    key: 'schema', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
    initialized: true, initializedBy: 'admin-init'
  })
  await upsert('system_meta', { key: 'app' }, {
    key: 'app', name: '自律', appVersion: APP_VERSION, environment: cloud.DYNAMIC_CURRENT_ENV
  })

  return {
    success: true,
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    previousSchemaVersion: currentSchemaVersion,
    collections: {
      total: collections.length,
      created: collectionResults.filter(x => x.created).map(x => x.name),
      existing: collectionResults.filter(x => !x.created).map(x => x.name)
    },
    seeded: { foods: foodResult, exercises: exerciseResult, bodyMetrics: metricResult, appConfig: configResult },
    migrations: migrations.map(x => x.migrationId),
    next: '初始化完成后建议删除/停用 admin-init 云函数，或配置 ADMIN_INIT_TOKEN。'
  }
}
