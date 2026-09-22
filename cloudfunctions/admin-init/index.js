const cloud = require('wx-server-sdk')
const { foods, exercises, bodyMetrics, appConfig } = require('./seed-data')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const APP_VERSION = '1.6.0'
const SCHEMA_VERSION = 15
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
  { migrationId: '011_default_admin_friend', schemaVersion: 11, description: '所有用户默认建立受保护的管理员好友关系' },
  { migrationId: '012_long_term_goals', schemaVersion: 12, description: '执行任务时间、私密长期目标、自动累计进度与今日卡片设置' },
  { migrationId: '013_goal_reminders_and_friend_dedupe', schemaVersion: 13, description: '长期目标节点提醒与重复好友关系清理' },
  { migrationId: '014_exam_progress_archives', schemaVersion: 14, description: '考试目标自动归档、备考快照、结果复盘与出分提醒' },
  { migrationId: '015_managed_accumulation_plans', schemaVersion: 15, description: '数量积累目标自动创建托管执行任务并统一归档生命周期' }
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
    db.collection('friendships').where({ userA, userB }).limit(100).get(),
    db.collection('friendships').where({ userA: userB, userB: userA }).limit(100).get()
  ])
  return preferredFriendship([...forward.data, ...reverse.data])
}

function timestampOf(friendship) {
  const value = friendship?.updatedAt || friendship?.acceptedAt || friendship?.requestedAt || friendship?.createdAt
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function friendshipRank(friendship) {
  const isDefaultAdmin = friendship?.defaultAdmin === true
    || friendship?.protected === true
    || friendship?.source === DEFAULT_ADMIN_FRIEND_SOURCE
  let rank = 0
  if (friendship?.status === 'ACCEPTED') rank = 30
  else if (friendship?.status === 'PENDING') rank = 20
  return rank && isDefaultAdmin ? rank + 100 : rank
}

function preferredFriendship(friendships) {
  return [...(friendships || [])].sort((a, b) => {
    const rankDifference = friendshipRank(b) - friendshipRank(a)
    if (rankDifference) return rankDifference
    const timeDifference = timestampOf(b) - timestampOf(a)
    if (timeDifference) return timeDifference
    return String(a?._id || '').localeCompare(String(b?._id || ''))
  })[0] || null
}

async function allMatches(collectionName, where) {
  const records = []
  while (true) {
    const result = await db.collection(collectionName).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if (result.data.length < 100) return records
  }
}

async function activeUsers() {
  return allMatches('users', { status: 'ACTIVE' })
}

async function dedupeActiveFriendships() {
  const [accepted, pending] = await Promise.all([
    allMatches('friendships', { status: 'ACCEPTED' }),
    allMatches('friendships', { status: 'PENDING' })
  ])
  const grouped = new Map()
  for (const friendship of [...accepted, ...pending]) {
    const userA = String(friendship.userA || '')
    const userB = String(friendship.userB || '')
    if (!userA || !userB || userA === userB) continue
    const key = [userA, userB].sort().join(':')
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(friendship)
  }
  const result = { activeRecords: accepted.length + pending.length, duplicatePairs: 0, markedDuplicate: 0 }
  for (const records of grouped.values()) {
    if (records.length < 2) continue
    result.duplicatePairs++
    const canonical = preferredFriendship(records)
    const timestamp = new Date()
    for (const duplicate of records.filter(item => item._id !== canonical._id)) {
      await db.collection('friendships').doc(duplicate._id).update({ data: {
        status: 'DUPLICATE',
        duplicateOf: canonical._id,
        deduplicatedAt: timestamp,
        updatedAt: timestamp
      } })
      result.markedDuplicate++
    }
  }
  return result
}

async function backfillManagedAccumulationPlans() {
  const goals=(await allMatches('plans',{ planType:'LONG_TERM' })).filter(goal =>
    goal.goalType === 'ACCUMULATION' && goal.goalStatus === 'ACTIVE'
    && !goal.deletedAt && goal.enabled !== false)
  const result={ total:goals.length,created:0,adopted:0,migratedBindings:0 }
  for(const goal of goals) {
    const userPlans=await allMatches('plans',{ userId:goal.userId })
    const managed=userPlans.find(plan => !plan.deletedAt && plan.managedByGoalId === goal._id)
    if(goal.managedExecutionPlanId && userPlans.some(plan => plan._id === goal.managedExecutionPlanId))continue
    if(managed) {
      await db.collection('plans').doc(goal._id).update({ data:{ managedExecutionPlanId:managed._id,updatedAt:new Date() } })
      result.adopted++
      continue
    }
    const linked=userPlans.filter(plan => plan.planType !== 'LONG_TERM' && !plan.deletedAt
      && Array.isArray(plan.longTermGoalIds) && plan.longTermGoalIds.includes(goal._id))
    const linkedIds=new Set(linked.map(plan => plan._id))
    const checkins=await allMatches('checkins',{ userId:goal.userId,completed:true })
    const historical=checkins.filter(item => linkedIds.has(item.planId)
      && (!goal.startDate || item.date >= goal.startDate))
    const primary=linked[0] || {}
    const allowedRepeats=new Set(['DAILY','WEEKDAYS','WEEKENDS','SPECIFIC_WEEKDAYS','WEEKLY_COUNT'])
    const timestamp=new Date()
    const remaining=Math.max(1,Number(goal.targetValue || 1)
      - historical.reduce((sum,item) => sum + Number(item.actualValue || 0),0))
    const childData={
      userId:goal.userId,planType:'EXECUTION',name:goal.name,description:'',
      category:primary.category || 'CUSTOM',targetType:'VALUE',
      targetValue:goal.unlimited ? Number(primary.targetValue || 1) : Number(primary.targetValue || Math.ceil(remaining / 100)),
      unit:goal.unit || '次',repeatType:allowedRepeats.has(primary.repeatType) ? primary.repeatType : 'DAILY',
      repeatConfig:primary.repeatConfig || {},startDate:goal.startDate || timestamp.toISOString().slice(0,10),
      endDate:null,executionTime:primary.executionTime || '',longTermGoalIds:[goal._id],
      privacyLevel:primary.privacyLevel || 'FRIENDS',timerMode:'NONE',timerDurationMinutes:null,
      managedByGoalId:goal._id,managedPlanType:'ACCUMULATION',managedLifecycleStatus:'ACTIVE',
      enabled:true,createdAt:timestamp,updatedAt:timestamp
    }
    const added=await db.collection('plans').add({ data:childData })
    for(const plan of linked) {
      await db.collection('plans').doc(plan._id).update({ data:{
        longTermGoalIds:plan.longTermGoalIds.filter(id => id !== goal._id),updatedAt:timestamp
      } })
      result.migratedBindings++
    }
    const history=Array.isArray(goal.linkedPlanHistory) ? goal.linkedPlanHistory : []
    const historicalPlans=linked.filter(plan => !history.some(item => item.planId === plan._id)).map(plan => ({
      planId:plan._id,name:plan.name,category:plan.category || 'CUSTOM',boundAt:timestamp,legacy:true
    }))
    await db.collection('plans').doc(goal._id).update({ data:{
      managedExecutionPlanId:added._id,
      accumulationBaselineValue:historical.reduce((sum,item) => sum + Number(item.actualValue || 0),0),
      accumulationBaselineCompletedCount:historical.length,
      accumulationBaselineDurationMinutes:historical.reduce((sum,item) => sum + Number(item.durationMinutes || 0),0),
      linkedPlanHistory:[...history,...historicalPlans,{
        planId:added._id,name:goal.name,category:childData.category,boundAt:timestamp,managed:true
      }].slice(-50),updatedAt:timestamp
    } })
    result.created++
  }
  return result
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
  const friendshipDeduplication = await dedupeActiveFriendships()
  const managedAccumulationPlans = await backfillManagedAccumulationPlans()

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
    friendshipDeduplication,
    managedAccumulationPlans,
    migrations: migrations.map(x => x.migrationId),
    next: '初始化完成后建议删除/停用 admin-init 云函数，或配置 ADMIN_INIT_TOKEN。'
  }
}
