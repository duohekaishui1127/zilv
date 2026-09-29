const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { hasEntitlement } = require('../cloudfunctions/api/domain/entitlements')
const { proActive } = require('../cloudfunctions/reminder-dispatch/pro-rules')
const { getCheckinReminderClient } = require('../miniprogram/utils/checkin-reminder')

function load(relative,mocks,extra = '') {
  const filename = path.join(__dirname,'..',relative), realRequire = createRequire(filename), module = { exports:{} }
  vm.runInNewContext(fs.readFileSync(filename,'utf8') + extra,{
    require:name => Object.hasOwn(mocks,name) ? mocks[name] : realRequire(name),module,exports:module.exports,console,
    process:{ env:{ PLAN_REMINDER_TEMPLATE_ID:'daily',SOCIAL_CHECKIN_TEMPLATE_ID:'social',PLAN_REMINDER_SUBSCRIPTION_TYPE:'ONE_TIME' } }
  },{ filename })
  return module.exports
}
function database(records) {
  return { command:{},collection(name) {
    const rows = records[name] || (records[name] = [])
    let criteria = {}, skip = 0, limit = Infinity
    const query = {
      where(value) { criteria = value; return query },skip(value) { skip = value; return query },limit(value) { limit = value; return query },orderBy() { return query },
      async get() { return { data:rows.filter(row => Object.entries(criteria).every(([key,value]) => row[key] === value)).slice(skip,skip + limit).map(row => ({ ...row })) } },
      doc(id) { return {
        async get() { const item = rows.find(row => row._id === id); if (!item) throw new Error('not found'); return { data:{ ...item } } },
        async update({ data }) { Object.assign(rows.find(row => row._id === id),data) },
        async set({ data }) { rows.push({ _id:id,...data }) }
      } }
    }
    return query
  } }
}
function notifications(user) {
  return load('cloudfunctions/api/actions/notifications.js',{
    '../lib/db':{ db:database({ users:[user] }),C:{ USERS:'users',NOTIFICATIONS:'notifications' } },
    '../services/notification-retention':{}
  })
}
test('Free 不能伪造授权或续订，但能修改消息中心提醒；保留历史和原授权偏好', async () => {
  const user = { _id:'u',checkinReminderEnabled:true,checkinReminderPushEnabled:true,checkinReminderTime:'10:00' }
  const actions = notifications(user)
  await assert.rejects(actions.renewCheckinReminderSubscription({ user,event:{ authorized:true },localDate:'2026-09-29' }),error => error.code === 'PRO_REQUIRED')
  await assert.rejects(actions.updateCheckinReminderSettings({ user,event:{ enabled:true,grantAccepted:true } }),error => error.code === 'PRO_REQUIRED')
  const settings = await actions.updateCheckinReminderSettings({ user,event:{ enabled:true,time:'11:00' } })
  assert.equal(settings.wechatAllowed,false)
  assert.equal(settings.enabled,true)
  assert.equal(user.checkinReminderPushEnabled,true)
  assert.equal(user.checkinReminderTime,'11:00')
})
test('Beta Pro 和永久 Pro 的开启、续订权益与定时发送规则一致', () => {
  const at = new Date('2026-09-29T00:00:00Z')
  for (const user of [{},{ proLifetime:true },{ proPermanent:true },{ betaUser:true,betaExpiresAt:'2026-09-30T00:00:00Z' },{ betaUser:true,betaExpiresAt:at.toISOString() }]) {
    assert.equal(hasEntitlement(user,'CHECKIN_WECHAT',at),proActive(user,at))
    assert.equal(hasEntitlement(user,'SPECIAL_CARE_WECHAT',at),proActive(user,at))
  }
})
test('Free 自动和主动续订均不调用微信原生订阅接口', async () => {
  let nativeRequests = 0
  const platform = { requestSubscribeMessage() { nativeRequests++ } }
  const api = { localDate:() => '2026-09-29',call:async () => { throw new Error('must not save') } }
  const client = getCheckinReminderClient(platform,api)
  const settings = { configured:true,templateId:'daily',subscriptionType:'ONE_TIME',enabled:true,pushEnabled:false,wechatAllowed:false }
  assert.equal(await client.renew(settings),false)
  assert.equal(await client.renew(settings,{ force:true }),false)
  assert.equal(nativeRequests,0)
})
test('Free 未打卡仍收到站内消息，定时发送不会消耗微信授权', async () => {
  const user = { _id:'u',openid:'openid',checkinReminderEnabled:true,checkinReminderPushEnabled:true,checkinReminderTime:'10:00',checkinReminderTimezoneOffset:480 }
  const records = { users:[user],plans:[{ _id:'p',userId:'u',enabled:true,repeatType:'DAILY' }],notifications:[] }
  let sends = 0
  const dispatcher = load('cloudfunctions/reminder-dispatch/index.js',{
    'wx-server-sdk':{ init() {},database:() => database(records),openapi:{ subscribeMessage:{ async send() { sends++; return { errCode:0 } } } } }
  },'\nmodule.exports.processUserForTest = processUser\n')
  assert.equal(await dispatcher.processUserForTest(user,new Date('2026-09-28T02:00:00Z')),'internal-only')
  assert.equal(sends,0)
  assert.equal(records.notifications[0].status,'UNREAD')
  assert.equal(records.notifications[0].pushStatus,'PRO_REQUIRED')
  assert.equal(user.checkinReminderPushEnabled,true)
})
test('已排队的特别关心消息在接收者 Pro 到期后停止微信推送，但不删除站内记录或偏好', async () => {
  const care = { _id:'care',userId:'u',targetUserId:'friend',enabled:true,wechatEnabled:true }
  const note = { _id:'n',userId:'u',actorUserId:'friend',planId:'p',checkinId:'c',pushStatus:'PENDING',status:'UNREAD',pushSources:[{ collection:'special_cares',id:'care',field:'wechatEnabled' }] }
  const records = { users:[{ _id:'u',openid:'openid',betaUser:true,betaExpiresAt:'2000-01-01T00:00:00Z' },{ _id:'friend' }],plans:[{ _id:'p' }],checkins:[{ _id:'c' }],special_cares:[care],notifications:[note] }
  let sends = 0
  const dispatcher = load('cloudfunctions/reminder-dispatch/index.js',{
    'wx-server-sdk':{ init() {},database:() => database(records),openapi:{ subscribeMessage:{ async send() { sends++; return { errCode:0 } } } } }
  },'\nmodule.exports.processSocialForTest = processSocialNotification\n')
  assert.equal(await dispatcher.processSocialForTest(note),'internal-only')
  assert.equal(sends,0)
  assert.equal(note.pushStatus,'PRO_REQUIRED')
  assert.equal(note.status,'UNREAD')
  assert.equal(care.wechatEnabled,true)
})
test('特别关心开启接口拒绝 Free；关闭已有订阅不要求 Pro', async () => {
  const care = { _id:'care',userId:'u',targetUserId:'friend',enabled:true,wechatEnabled:true }
  const actions = load('cloudfunctions/api/actions/social-engagement.js',{
    '../lib/db':{ db:database({ special_cares:[care] }),C:{ SPECIAL_CARES:'special_cares' } },
    '../services/social':{ friendshipBetween:async () => ({ status:'ACCEPTED' }),socialNotificationConfig:() => ({ configured:true,templateId:'social' }) }
  })
  await assert.rejects(actions.setSpecialCareWechat({ user:{ _id:'u' },event:{ targetUserId:'friend',enabled:true,grantAccepted:true } }),error => error.code === 'PRO_REQUIRED')
  await actions.setSpecialCareWechat({ user:{ _id:'u' },event:{ targetUserId:'friend',enabled:false } })
  assert.equal(care.wechatEnabled,false)
  assert.equal((await actions.getSocialNotificationConfig({ user:{ _id:'u' } })).wechatAllowed,false)
})
test('旧趋势接口不泄露30/90天 Pro 数据；Free 周报只返回摘要', async () => {
  let reads = 0
  const report = { startDate:'2026-09-21',endDate:'2026-09-27',days:7,summary:{ completedTasks:2,focusMinutes:40,reviewDays:1,activeDays:1,longestStreak:1 },daily:[{ weightKg:70 }],details:{ secret:'analysis' } }
  const actions = load('cloudfunctions/api/actions/reports.js',{
    '../services/progress':{ fetchAll:async () => [],loadProgressReport:async () => { reads++; return report },loadProgressReportRange:async () => report },
    '../services/achievements':{ loadAchievements:async () => ({ badges:[] }) },
    '../domain/makeup-cards':{ todayForUser:() => '2026-09-29' }
  })
  for (const days of [30,90]) await assert.rejects(actions.getProgressReport({ user:{ _id:'u' },event:{ days },localDate:'2026-09-29' }),error => error.code === 'PRO_REQUIRED')
  assert.equal(reads,0)
  const weekly = await actions.getWeeklyReport({ user:{ _id:'u' },localDate:'2026-09-29' })
  assert.equal(weekly.daily,undefined)
  assert.equal(weekly.details,undefined)
  const basic = await actions.getReviewReport({ user:{ _id:'u',createdAt:'2026-09-01' },event:{ period:'WEEK' } })
  assert.equal(basic.basic,true)
  assert.equal(basic.current.summary.completedTasks,2)
  assert.equal(basic.current.daily,undefined)
  assert.equal((await actions.getReviewReport({ user:{ _id:'u' },event:{ period:'MONTH' } })).locked,true)
  assert.equal((await actions.getReviewReport({ user:{ _id:'u' },event:{ period:'WEEK',offset:1 } })).locked,true)
})
test('高级纪念章由服务端裁剪详情，但获得日期和归属不丢失', async () => {
  const badge = { id:'b',title:'百小时专注',pro:true,unlocked:true,symbol:'100H',earnedAt:'2026-09-26',subtitle:'完整详情',progress:6000,target:6000 }
  const actions = load('cloudfunctions/api/actions/achievements.js',{
    '../services/achievements':{ loadAchievements:async () => ({ badges:[badge],unlockedCount:1,totalCount:1 }) }
  })
  const free = await actions.getAchievements({ user:{ _id:'u' },localDate:'2026-09-29' })
  assert.equal(free.badges[0].progress,undefined)
  assert.equal(free.badges[0].target,undefined)
  assert.equal(free.badges[0].earnedAt,'2026-09-26')
  assert.equal(free.badges[0].unlocked,true)
  const pro = await actions.getAchievements({ user:{ _id:'u',proLifetime:true },localDate:'2026-09-29' })
  assert.equal(pro.badges[0].progress,6000)
})
test('报告分页超过1000条仍完整读取，并使用稳定排序', async () => {
  const rows = Array.from({ length:1005 },(_,i) => ({ _id:`r${i}`,userId:'u' }))
  const service = load('cloudfunctions/api/services/progress.js',{ '../lib/db':{ db:database({ records:rows }),C:{} } })
  assert.equal((await service.fetchAll('records',{ userId:'u' })).length,1005)
})
