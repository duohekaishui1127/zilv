const cloud = require('wx-server-sdk')
const { foods, exercises, bodyMetrics, appConfig } = require('./seed-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const APP_VERSION = '1.6.0'
const SCHEMA_VERSION = 11
const DEFAULT_ADMIN_FRIEND_SOURCE = 'DEFAULT_ADMIN'

const collections = [
  'users','body_records','nutrition_profiles','nutrition_targets','foods','meals','meal_items',
  'workout_sessions','plans','checkins','study_sessions','friendships','privacy_settings','groups',
  'group_members','plan_group_bindings','group_plan_change_requests','group_events','exercises','body_metric_defs','app_config',
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
  { migrationId: '009_friend_profiles', schemaVersion: 9, description: '好友资料、备注、单好友隐私例外与申请通知' },
  { migrationId: '010_group_plan_approvals', schemaVersion: 10, description: '群监督计划锁定、变更审批、群主移出成员及个人社交列表设置' },
  { migrationId: '011_default_admin_friend', schemaVersion: 11, description: '所有用户默认建立受保护的管理员好友关系' }
]

function normalizeShareCode(value) {
  return String(value || '').trim().toUpperCase()
}

function defaultAdminShareCode(event) {
  const direct = normalizeShareCode(event.defaultAdminShareCode || process.env.DEFAULT_FRIEND_ADMIN_SHARE_CODE)
  if (direct) return direct
  return String(process.env.FEEDBACK_ADMIN_SHARE_CODES || '')
    .split(',')
    .map(normalizeShareCode)
    .find(Boolean) || ''
}

async function friendshipBetween(userA, userB) {
  const [forward, reverse] = await Promise.all([
    db.collection('friendships').where({ userA, userB }).limit(1).get(),
    db.collection('friendships').where({ userA: userB, userB: userA }).limit(1).get()
  ])
  return forward.data[0] || reverse.data[0] || null
}

async function activeUsers() {
  const users = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const result = await db.collection('users').where({ status: 'ACTIVE' }).skip(offset).limit(pageSize).get()
    users.push(...result.data)
    if (result.data.length < pageSize) return users
  }
}

async function backfillDefaultAdminFriendships(event) {
  const shareCode = defaultAdminShareCode(event)
  if (!shareCode) return { configured: false, adminFound: false, totalUsers: 0, inserted: 0, updated: 0, unchanged: 0 }

  const adminResult = await db.collection('users').where({ shareCode, status: 'ACTIVE' }).limit(1).get()
  const admin = adminResult.data[0]
  if (!admin) return { configured: true, adminFound: false, shareCode, totalUsers: 0, inserted: 0, updated: 0, unchanged: 0 }

  const users = await activeUsers()
  const result = { configured: true, adminFound: true, shareCode, adminUserId: admin._id, totalUsers: users.length, inserted: 0, updated: 0, unchanged: 0 }
  for (const user of users) {
    const timestamp = new Date()
    if (user._id === admin._id) {
      result.unchanged++
    } else {
      const existing = await friendshipBetween(admin._id, user._id)
      const data = {
        userA: admin._id,
        userB: user._id,
        status: 'ACCEPTED',
        requestedBy: admin._id,
        acceptedAt: existing?.acceptedAt || timestamp,
        defaultAdmin: true,
        protected: true,
        source: DEFAULT_ADMIN_FRIEND_SOURCE,
        defaultAdminSince: existing?.defaultAdminSince || timestamp,
        updatedAt: timestamp
      }
      if (existing) {
        await db.collection('friendships').doc(existing._id).update({ data })
        result.updated++
      } else {
        await db.collection('friendships').add({ data: { ...data, createdAt: timestamp } })
        result.inserted++
      }
    }
    await db.collection('users').doc(user._id).update({ data: {
      defaultAdminFriendshipInitialized: true,
      defaultAdminUserId: admin._id,
      defaultAdminFriendshipInitializedAt: timestamp,
      updatedAt: timestamp
    } })
  }
  return result
}

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
  const collectionsToEnsure = isIncrementalUpgrade ? ['feedbacks', 'daily_reviews', 'group_event_likes', 'special_cares', 'friend_settings', 'group_plan_change_requests'] : collections
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

  const defaultAdminFriendships = await backfillDefaultAdminFriendships(event)

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
    defaultAdminFriendships,
    migrations: migrations.map(x => x.migrationId),
    next: '初始化完成后建议删除/停用 admin-init 云函数，或配置 ADMIN_INIT_TOKEN。'
  }
}
