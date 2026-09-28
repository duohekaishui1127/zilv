const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function database(records) {
  const queried = []
  const db = {
    command: {},
    collection(name) {
      queried.push(name)
      const rows = records[name] || (records[name] = [])
      let criteria = {}, skip = 0, limit = Infinity
      const query = {
        where(value) { criteria = value; return query },
        skip(value) { skip = value; return query },
        limit(value) { limit = value; return query },
        orderBy() { return query },
        async get() {
          return { data: rows.filter(row => Object.entries(criteria).every(([key, value]) => row[key] === value))
            .slice(skip, skip + limit).map(row => ({ ...row })) }
        },
        doc(id) {
          return {
            async get() {
              const row = rows.find(item => item._id === id)
              if (!row) throw new Error('not found')
              return { data: { ...row } }
            },
            async update({ data }) {
              const row = rows.find(item => item._id === id)
              assert.ok(row, `${name}/${id} exists`)
              Object.assign(row, data)
            },
            async set({ data }) { rows.push({ _id: id, ...data }) }
          }
        }
      }
      return query
    }
  }
  return { db, queried }
}

function loadModule(relative, mocks, extra = '') {
  const file = path.join(__dirname, '..', relative)
  const realRequire = createRequire(file)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + extra, {
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name),
    module, exports: module.exports, console,
    process: { env: { PLAN_REMINDER_TEMPLATE_ID: 'checkin-template', PLAN_REMINDER_SUBSCRIPTION_TYPE: 'ONE_TIME' } }
  }, { filename: file })
  return module.exports
}

function notificationActions(db) {
  return loadModule('cloudfunctions/api/actions/notifications.js', {
    '../lib/db': { db, C: { USERS: 'users', NOTIFICATIONS: 'notifications' } },
    '../services/notification-retention': { notificationWindow() {}, trimNotificationHistory() {} }
  })
}

function reminderUser(overrides = {}) {
  return {
    _id: 'user-1', openid: 'wechat-user', checkinReminderEnabled: true,
    checkinReminderTime: '10:00', checkinReminderTimezoneOffset: 480,
    checkinReminderPushEnabled: false, lastReminderRenewalDate: '2026-09-28', ...overrides
  }
}

test('当天续订额度已消耗后，新接受的授权必须恢复额度且不改提醒时间', async () => {
  const user = reminderUser()
  const { db } = database({ users: [user] })
  const actions = notificationActions(db)
  const result = await actions.renewCheckinReminderSubscription({
    user: { ...user }, event: { authorized: true }, localDate: '2026-09-28'
  })
  assert.equal(result.renewed, true)
  assert.equal(user.checkinReminderPushEnabled, true)
  assert.equal(user.checkinReminderTime, '10:00')
  assert.equal(user.checkinReminderTimezoneOffset, 480)
  assert.equal(user.lastReminderRenewalDate, '2026-09-28')
})

test('没有授权不能伪造续订，已有额度或关闭提醒时不改变用户偏好', async () => {
  for (const overrides of [{}, { checkinReminderEnabled: false }, { checkinReminderPushEnabled: true }]) {
    const user = reminderUser(overrides)
    const before = { ...user }
    const { db } = database({ users: [user] })
    const actions = notificationActions(db)
    await assert.rejects(actions.renewCheckinReminderSubscription({
      user: { ...user }, event: { authorized: false }, localDate: '2026-09-28'
    }), error => error.code === 'REMINDER_AUTH_REQUIRED')
    assert.deepEqual(user, before)
    if (overrides.checkinReminderEnabled === false || overrides.checkinReminderPushEnabled) {
      const result = await actions.renewCheckinReminderSubscription({
        user: { ...user }, event: { authorized: true }, localDate: '2026-09-28'
      })
      assert.equal(result.renewed, false)
      assert.deepEqual(user, before)
    }
  }
})

test('补签昨天并续订后，今日 10:00 未完成任务仍发微信提醒和消息中心记录', async () => {
  const user = reminderUser()
  const records = {
    users: [user],
    plans: [{ _id: 'study', userId: user._id, enabled: true, repeatType: 'DAILY', startDate: '2026-09-01' }],
    checkins: [{ _id: 'yesterday-task', userId: user._id, planId: 'study', date: '2026-09-27', completed: true }],
    daily_reviews: [{ _id: 'yesterday-review', userId: user._id, date: '2026-09-27', checkinMode: 'MAKEUP' }],
    notifications: []
  }
  const { db, queried } = database(records)
  await notificationActions(db).renewCheckinReminderSubscription({
    user: { ...user }, event: { authorized: true }, localDate: '2026-09-28'
  })
  const sends = []
  const cloud = {
    init() {}, database: () => db,
    openapi: { subscribeMessage: { async send(message) { sends.push(message); return { errCode: 0 } } } }
  }
  const dispatcher = loadModule('cloudfunctions/reminder-dispatch/index.js', { 'wx-server-sdk': cloud },
    '\nmodule.exports.processUserForTest = processUser\n')
  const at = new Date('2026-09-28T02:00:00Z')
  assert.equal(await dispatcher.processUserForTest({ ...user }, at), 'sent')
  assert.equal(sends.length, 1)
  assert.equal(sends[0].data.time30.value, '10:00')
  assert.equal(records.notifications[0].recordDate, '2026-09-28')
  assert.equal(records.notifications[0].pushStatus, 'SENT')
  assert.equal(user.checkinReminderPushEnabled, false, '一次性授权在实际发送后消耗')
  assert.equal(queried.includes('daily_reviews'), false, '昨天整日补签不会改变今日任务判断')
  assert.equal(await dispatcher.processUserForTest({ ...user }, at), 'duplicate')
  assert.equal(sends.length, 1)
})

test('今日任务已完成时，即使昨天补签续订，也不发 10:00 未完成提醒', async () => {
  const user = reminderUser({ checkinReminderPushEnabled: true })
  const records = {
    users: [user],
    plans: [{ _id: 'study', userId: user._id, enabled: true, repeatType: 'DAILY', startDate: '2026-09-01' }],
    checkins: [{ userId: user._id, planId: 'study', date: '2026-09-28', completed: true }]
  }
  const { db } = database(records)
  const dispatcher = loadModule('cloudfunctions/reminder-dispatch/index.js', {
    'wx-server-sdk': { init() {}, database: () => db }
  }, '\nmodule.exports.processUserForTest = processUser\n')
  assert.equal(await dispatcher.processUserForTest({ ...user }, new Date('2026-09-28T02:00:00Z')), 'skipped')
  assert.equal(user.checkinReminderPushEnabled, true)
})
