const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { createDraftStore } = require('../miniprogram/utils/drafts')
const { reconcileDailyReview } = require('../miniprogram/utils/task-reconciliation')

function pageAt(relative,api,drafts) {
  const file = path.join(__dirname,'../miniprogram/pages',relative)
  const realRequire = createRequire(file)
  let page
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    require:name => name === '../../utils/api' ? api : name === '../../utils/drafts' && drafts ? drafts : realRequire(name),
    Page:value => { page=value },wx:{ showToast() {},setNavigationBarTitle() {} },console,setTimeout,clearTimeout,setInterval,clearInterval
  },{ filename:file })
  page.data = structuredClone(page.data)
  page.setData = (patch,callback) => {
    for (const [key,value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g,'.$1').split('.')
      let target = page.data
      for (const part of parts.slice(0,-1)) target = target[part]
      target[parts.at(-1)] = value
    }
    callback?.()
  }
  return page
}
function today(call,drafts) {
  const page=pageAt('today/index.js',{ call,localDate:() => '2026-09-29' },drafts)
  page.data.dashboard={ user:{_id:'u'},businessDate:'2026-09-29',plans:[
    {_id:'a',name:'阅读',targetType:'BOOLEAN',targetValue:1,completed:false},
    {_id:'b',name:'运动',targetType:'BOOLEAN',targetValue:1,completed:false}
  ],completion:{ total:2,completed:0 },longTermGoals:[] }
  page.beginReminderRenewal=() => Promise.resolve(false)
  page.maybePromptDailyReview=() => {}
  return page
}
test('整日打卡直接使用服务器结果，心情可以留空，不多请求首页',async () => {
  const calls=[]
  const page=today(async action => {
    calls.push(action)
    return { review:{ date:'2026-09-29',mood:'',note:action === 'saveDailyReview' ? '今天生病了' : '' },currentStreak:3 }
  })
  await page.manualDailyCheckin()
  assert.equal(page.data.dailyReviewEditor.visible,true)
  page.data.dailyReviewEditor.note='今天生病了'
  await page.saveDailyReview()
  assert.equal(page.data.dashboard.dailyReview.note,'今天生病了')
  assert.equal(page.data.dailyReviewEditor.visible,false)
  assert.deepEqual(calls,['manualDailyCheckin','saveDailyReview'])
})
test('编辑任务备注仅更新返回的任务列表，不重新加载整个页面',async () => {
  const calls=[]
  const page=today(async action => { calls.push(action);return {plans:[{_id:'a',completed:true,checkin:{note:'有收获'}}]} })
  page.data.dashboard.plans[0].completed=true
  page.showCompletion(page.data.dashboard.plans[0])
  page.data.completionEditor.note='有收获'
  await page.saveCompletion()
  assert.deepEqual(calls,['completePlan'])
  assert.equal(page.data.dashboard.plans[0].checkin.note,'有收获')
})
test('撤回立即有反馈，失败只恢复该任务，不撤销另一个成功操作',async () => {
  let reject
  const page=today(() => new Promise((_,fail) => { reject=fail }))
  const plan={...page.data.dashboard.plans[0],completed:true,checkin:{completed:true,date:'2026-09-29'}}
  page.data.dashboard.plans[0]=plan;page.data.dashboard.completion.completed=1
  const saving=page.revokeCompletion(plan)
  assert.equal(page.data.dashboard.plans[0].completed,false)
  page.data.dashboard.plans[1]={...page.data.dashboard.plans[1],completed:true}
  reject(new Error('网络失败'));assert.equal(await saving,false)
  assert.equal(page.data.dashboard.plans[0].completed,true)
  assert.equal(page.data.dashboard.plans[1].completed,true)
  assert.equal(page.data.dashboard.completion.completed,2)
})
test('迟到的任务结果不能覆盖新心情，撤回后整日记录仍保留',() => {
  const page=today(async () => {})
  page.data.dashboard.dailyReview={date:'2026-09-29',mood:'GOOD',note:'新的小记',updatedAt:'2026-09-29T02:00:00Z'}
  page.applyCompletionResult({plans:page.data.dashboard.plans,dailyReview:{date:'2026-09-29',mood:'',note:'',updatedAt:'2026-09-29T01:00:00Z'}})
  assert.equal(page.data.dashboard.dailyReview.mood,'GOOD')
  assert.equal(page.data.dashboard.dailyReview.note,'新的小记')
  assert.equal(page.data.dashboard.dailyReview.checkinState,'INCOMPLETE')
  assert.equal(reconcileDailyReview(null,page.data.dashboard.dailyReview,{total:2,completed:2}).checkinState,'COMPLETE')
})
test('新建任务高级字段默认折叠，模板填充数量和频率；编辑保持原值',async () => {
  const plan={name:'自定义',category:'STUDY',targetType:'COUNT',targetValue:42,unit:'页',repeatType:'SPECIFIC_WEEKDAYS',repeatConfig:{weekdays:[1,3]}}
  const page=pageAt('plan/edit.js',{localDate:() => '2026-09-29',call:async () => ({plan})})
  assert.equal(page.data.advanced,false)
  page.usePreset({currentTarget:{dataset:{index:2}}})
  assert.equal(page.data.targetValue,50);assert.equal(page.data.repeatValues[page.data.repeatIndex],'DAILY')
  page.data.editMode=true
  await page.loadPlan()
  assert.equal(page.data.advanced,true);assert.equal(page.data.targetValue,42)
  assert.equal(page.data.weekdays.filter(day => day.selected).length,2)
  page.usePreset({currentTarget:{dataset:{index:0}}})
  assert.equal(page.data.targetValue,42)
})
test('未保存小记恢复草稿，保存失败继续保留输入和草稿',async () => {
  let stored
  const drafts=createDraftStore({getStorageSync:() => stored,setStorageSync:(_,value) => {stored=value}})
  const page=today(async () => {throw new Error('offline')},drafts)
  page.data.dashboard.dailyReview={date:'2026-09-29',mood:'',note:''}
  page.openDailyReview();page.dailyReviewInput({detail:{value:'写到一半'}});page.closeDailyReview()
  page.openDailyReview();assert.equal(page.data.dailyReviewEditor.note,'写到一半')
  await assert.rejects(page.saveDailyReview(),/offline/)
  assert.equal(page.data.dailyReviewEditor.visible,true)
  drafts.flush();assert.equal(drafts.get('daily:u:2026-09-29',JSON.stringify(['',''])).note,'写到一半')
  drafts.clear()
})
test('跨天刷新不把昨天已确认的完成状态带到今天',async () => {
  const data={user:{_id:'u'},businessDate:'2026-09-30',plans:[{_id:'a',completed:false}],nutrition:{},energy:{},longTermGoals:[],serverTime:'2026-09-30T01:00:00Z'}
  const page=today(async () => structuredClone(data))
  page.data.dashboard.plans[0]={_id:'a',completed:true,checkin:{date:'2026-09-29',completed:true,updatedAt:'2026-09-29T10:00:00Z'}}
  for(const method of ['updateReminderRenewalState','revealActiveTimer','startTicker','finishExpiredCountdown'])page[method]=() => {}
  await page.load()
  assert.equal(page.data.dashboard.plans[0].completed,false)
  assert.equal(page.data.dashboard.completion.completed,0)
})
test('暂停和恢复计时直接应用返回记录，不重复请求首页',async () => {
  const calls=[]
  const page=today(async action => {
    calls.push(action)
    return {checkin:{planId:'a',date:'2026-09-29',timerMode:'COUNT_UP',timerStatus:action==='pausePlanTimer' ? 'PAUSED' : 'RUNNING',timerAccumulatedMs:60000}}
  })
  page.startTicker=() => {};page.refreshActiveTimerBar=() => {}
  page.data.dashboard.plans[0].timerMode='COUNT_UP'
  await page.pauseTimer({currentTarget:{dataset:{index:0}}})
  assert.equal(page.data.dashboard.plans[0].timerStatus,'PAUSED')
  await page.resumeTimer({currentTarget:{dataset:{index:0}}})
  assert.equal(page.data.dashboard.plans[0].timerStatus,'RUNNING')
  assert.deepEqual(calls,['pausePlanTimer','resumePlanTimer'])
})
test('较早首页响应不能覆盖刚完成的操作和目标状态',async () => {
  let resolve
  const page=today(() => new Promise(done => { resolve=done }))
  const loading=page.load()
  page.applyCompletionResult({plans:[{_id:'a',completed:true,checkin:{updatedAt:'2026-09-29T01:00:00Z'}}]})
  resolve({plans:[{_id:'a',completed:false}],longTermGoals:[]})
  await loading
  assert.equal(page.data.dashboard.plans[0].completed,true)
  assert.equal(page.data.loading,false)
})
test('主动刷新信任服务端已清除的记录，不永久保留旧完成状态',async () => {
  const data={user:{_id:'u'},businessDate:'2026-09-29',plans:[{_id:'a',completed:false}],nutrition:{},energy:{},dailyReview:null,longTermGoals:[],serverTime:'2026-09-29T01:00:00Z'}
  const page=today(async () => structuredClone(data))
  page.data.dashboard.plans[0]={_id:'a',completed:true,checkin:{date:'2026-09-29',updatedAt:'2026-09-29T00:00:00Z'}}
  page.data.dashboard.dailyReview={date:'2026-09-29',mood:'GOOD'}
  for(const method of ['updateReminderRenewalState','revealActiveTimer','startTicker','finishExpiredCountdown'])page[method]=() => {}
  await page.load({fresh:true})
  assert.equal(page.data.dashboard.plans[0].completed,false)
  assert.equal(page.data.dashboard.dailyReview,null)
})
test('昨天操作失败后的回滚不改变今天同名任务',() => {
  const page=today(async () => {})
  page.rollbackOptimisticCompletion({businessDate:'2026-09-28',plan:{_id:'a',completed:true}})
  assert.equal(page.data.dashboard.plans[0].completed,false)
})
test('确认完成后直接更新连续打卡天数，不等待第二次首页请求',() => {
  const page=today(async () => {})
  page.applyCompletionResult({plans:page.data.dashboard.plans,dailyReview:{date:'2026-09-29',mood:''},currentStreak:8})
  assert.equal(page.data.dashboard.currentStreak,8)
})
test('缓存返回的计时服务器时间继续前进，不让页面时钟倒退',async () => {
  let at=Date.parse('2026-09-29T00:00:00Z'),calls=0
  class Clock extends Date { constructor(...args){super(...(args.length ? args : [at]))} static now(){return at} }
  const file=path.join(__dirname,'../miniprogram/utils/api.js'),realRequire=createRequire(file),module={exports:{}}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    require:realRequire,module,exports:module.exports,Date:Clock,console,wx:{cloud:{async callFunction(){calls++;return {result:{success:true,serverTime:'2026-09-29T02:00:00Z',timezoneOffset:480,data:{serverTime:'2026-09-29T02:00:00Z'}}}}}}
  },{filename:file})
  const first=await module.exports.call('dashboard')
  at+=10000
  const second=await module.exports.call('dashboard')
  assert.equal(calls,1)
  assert.equal(new Date(second.serverTime)-new Date(first.serverTime),10000)
})
