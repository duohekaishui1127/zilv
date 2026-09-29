const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequestCache } = require('../miniprogram/utils/request-cache')
const { createDraftStore } = require('../miniprogram/utils/drafts')
const { reconcileTask } = require('../miniprogram/utils/task-reconciliation')
const { requestDate } = require('../cloudfunctions/api/domain/request-date')
const { historicalPlans } = require('../cloudfunctions/api/domain/historical-plans')
const { recordExecutionHistory,executionSnapshot } = require('../cloudfunctions/api/domain/execution-history')
const { examProgressSnapshot } = require('../cloudfunctions/api/domain/exam-progress')
const deferred = () => { let resolve,reject; const promise = new Promise((a,b) => { resolve=a;reject=b }); return { promise,resolve,reject } }

test('只读短缓存合并请求、返回独立副本，过期后重新读取',async () => {
  let now = 0, reads = 0
  const cache = createRequestCache(() => now), job = deferred()
  const read = () => { reads++; return job.promise }
  const a = cache.run('dashboard',{},read), b = cache.run('dashboard',{},read)
  job.resolve({ plans:[{ completed:false }] })
  const values = await Promise.all([a,b]); values[0].plans[0].completed=true
  assert.equal(reads,1); assert.equal(values[1].plans[0].completed,false)
  assert.equal((await cache.run('dashboard',{},read)).plans[0].completed,false)
  now=15001; await cache.run('dashboard',{},read); assert.equal(reads,2)
})
test('修改前后都清缓存，修改前的迟到读取不会覆盖新记录',async () => {
  const cache = createRequestCache(), old = deferred(), write = deferred()
  const stale = cache.run('dashboard',{},() => old.promise)
  const mutation = cache.run('completePlan',{},() => write.promise)
  await cache.run('dashboard',{},async () => ({ version:2 }))
  old.resolve({ version:1 }); await stale
  assert.equal((await cache.run('dashboard',{},async () => ({ version:9 }))).version,2)
  write.resolve({ saved:true }); await mutation
  assert.equal((await cache.run('dashboard',{},async () => ({ version:3 }))).version,3)
})
test('强制刷新忽略缓存且旧请求不能回写；写入从不合并',async () => {
  const cache = createRequestCache(), old = deferred()
  const stale = cache.run('getPlans',{},() => old.promise)
  await cache.run('getPlans',{},async () => ({ version:2 }),{ fresh:true })
  old.resolve({ version:1 }); await stale
  assert.equal((await cache.run('getPlans',{},async () => ({ version:0 }))).version,2)
  let writes=0
  await Promise.all([1,2].map(() => cache.run('completePlan',{},async () => ++writes)))
  assert.equal(writes,2)
})
test('失败不缓存，也不会吞掉错误',async () => {
  const cache = createRequestCache()
  await assert.rejects(cache.run('dashboard',{},async () => { throw new Error('offline') }),/offline/)
  assert.equal(await cache.run('dashboard',{},async () => 1),1)
})
test('草稿隔离用户和日期，服务器内容改变时不恢复旧草稿',() => {
  let stored, now=1
  const drafts=createDraftStore({ getStorageSync:() => stored,setStorageSync:(_,value) => { stored=value } },() => now)
  drafts.save('u1:day1',{ note:'未保存' },'old'); drafts.flush()
  assert.equal(drafts.get('u1:day1','old').note,'未保存')
  assert.equal(drafts.get('u2:day1','old'),null); assert.equal(drafts.get('u1:day2','old'),null)
  assert.equal(drafts.get('u1:day1','changed'),null)
  now+=8*86400000; assert.equal(drafts.get('u1:day1','old'),null)
})
test('草稿成功保存后删除，注销清空；保存次数合并',() => {
  let stored, writes=0
  const drafts=createDraftStore({ getStorageSync:() => stored,setStorageSync:(_,value) => { stored=value;writes++ } })
  drafts.save('a',{ note:'1' },'base'); drafts.save('a',{ note:'2' },'base'); drafts.flush()
  assert.equal(writes,1); assert.equal(drafts.get('a','base').note,'2')
  drafts.remove('a'); assert.equal(drafts.get('a','base'),null)
  drafts.save('b',{ note:'3' },'base'); drafts.clear(); assert.equal(drafts.get('b','base'),null)
})
test('业务日期不接受未来仪表盘日期，跨时区按服务器时间判断',() => {
  const at=new Date('2026-09-29T16:10:00Z')
  assert.equal(requestDate('dashboard',{ date:'2030-01-01' },{},at),'2026-09-30')
  assert.equal(requestDate('dashboard',{}, { checkinReminderTimezoneOffset:-240 },at),'2026-09-29')
  assert.throws(() => requestDate('completePlan',{ date:'2026-09-29' },{},at),error => error.code==='DAY_CHANGED')
  assert.equal(requestDate('saveDailyReview',{ date:'2026-09-29' },{},at),'2026-09-29')
  assert.throws(() => requestDate('saveDailyReview',{ date:'2026-02-31' },{},at),error => error.code==='INVALID_PARAMETER')
})
test('日历优先使用执行快照，停用或改名不能改写昨天',() => {
  const plan={ _id:'p',name:'背50词',repeatType:'DAILY',enabled:true,targetType:'COUNT',targetValue:50,createdAt:'2026-09-01' }
  plan.scheduleHistory=recordExecutionHistory(plan,{},'2026-09-01')
  const snapshot=executionSnapshot(plan)
  plan.scheduleHistory=recordExecutionHistory(plan,{ name:'背100词',targetValue:100,enabled:false },'2026-09-29')
  plan.name='背100词';plan.targetValue=100;plan.enabled=false
  const checkin={ planId:'p',date:'2026-09-28',completed:true,actualValue:50,planSnapshot:snapshot }
  const result=historicalPlans([plan],[checkin],null,'2026-09-28')
  assert.equal(result.tasks[0].name,'背50词'); assert.equal(result.tasks[0].targetValue,50)
  assert.equal(historicalPlans([plan],[],null,'2026-09-28').tasks.length,1)
})
test('无法核实的旧排期不会把当前规则反推到过去',() => {
  const plan={ _id:'p',name:'现在的任务',repeatType:'DAILY',enabled:true,createdAt:'2026-09-01',updatedAt:'2026-09-29' }
  const result=historicalPlans([plan],[],null,'2026-09-28')
  assert.equal(result.tasks.length,0); assert.equal(result.historyUnavailable,true)
  const review={ taskSnapshot:[{ planId:'p',name:'昨天的任务',repeatType:'DAILY',enabled:true }] }
  assert.equal(historicalPlans([plan],[],review,'2026-09-28').tasks[0].name,'昨天的任务')
})
test('历史每周次数达到目标后不再要求执行，重复旧记录不重复计数',() => {
  const plan={ _id:'p',repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:2 },enabled:true,createdAt:'2026-09-01' }
  const checks=['2026-09-21','2026-09-22','2026-09-22'].map(date => ({ planId:'p',date,completed:true }))
  assert.equal(historicalPlans([plan],[],null,'2026-09-23',checks).tasks.length,0)
})
test('考试归档按历史关联和排期累计，不把解绑后的完成计入',() => {
  const plan={ _id:'p',name:'阅读',repeatType:'DAILY',enabled:true,createdAt:'2026-09-21',longTermGoalIds:['exam'] }
  plan.scheduleHistory=recordExecutionHistory(plan,{},'2026-09-21')
  plan.scheduleHistory=recordExecutionHistory(plan,{ longTermGoalIds:[] },'2026-09-23')
  const checks=['2026-09-21','2026-09-22','2026-09-23'].map(date => ({ planId:'p',date,completed:true,durationMinutes:10,longTermGoalIdsSnapshot:date<'2026-09-23' ? ['exam'] : [] }))
  const result=examProgressSnapshot({ _id:'exam',startDate:'2026-09-21',deadlineDate:'2026-09-23' },[plan],checks)
  assert.equal(result.completedCount,2); assert.equal(result.scheduledCount,2)
  assert.equal(result.durationMinutes,20); assert.equal(result.completionPct,100)
})
test('迟到请求不覆盖已确认完成；待撤回立即保持未完成预览',() => {
  const local={ completed:true,checkin:{ completed:true,updatedAt:'2026-09-29T00:01:00Z' } }
  assert.equal(reconcileTask({ completed:false },local,false,false).completed,true)
  assert.equal(reconcileTask({ completed:true },{ completed:false,checkin:{ completed:false,optimistic:true } },false,true).completed,false)
})
