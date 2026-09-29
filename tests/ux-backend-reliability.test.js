const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const {createRequire}=require('node:module')
function load(relative,mocks,extra={}) {
  const file=path.join(__dirname,'..',relative),realRequire=createRequire(file),module={exports:{}}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>Object.hasOwn(mocks,name)?mocks[name]:realRequire(name),module,exports:module.exports,console,...extra},{filename:file})
  return module.exports
}
function database(initial) {
  let records=structuredClone(initial),queue=Promise.resolve()
  function access(data){return {collection(name){
    const table=data[name]||(data[name]={}),query={
      criteria:{},where(criteria){query.criteria=criteria;return query},limit(){return query},
      async get(){return {data:Object.values(table).filter(row=>Object.entries(query.criteria).every(([key,value])=>row[key]===value)).map(row=>structuredClone(row))}},
      doc(id){return {
        async get(){if(!table[id])throw new Error('not found');return {data:structuredClone(table[id])}},
        async set({data}){table[id]={...data,_id:id}},
        async update({data}){Object.assign(table[id],data)}
      }}
    };return query
  }}}
  const db={collection:name=>access(records).collection(name),runTransaction(callback){
    const job=queue.then(async()=>{const next=structuredClone(records),result=await callback(access(next));records=next;return {result}})
    queue=job.catch(()=>{});return job
  }}
  return {db,read:()=>records}
}
const C={USERS:'users',CHECKINS:'checkins',DAILY_REVIEWS:'reviews'}
const at=new Date('2026-09-29T01:00:00Z')
const utils=require('../cloudfunctions/api/lib/utils')
test('自动与手动整日打卡并发仍只保留一条，撤回/重打保留心情与小记',async()=>{
  const state=database({reviews:{}}),plans=[{_id:'p',completed:true,name:'阅读',enabled:true,repeatType:'DAILY'}]
  const actions=load('cloudfunctions/api/services/daily-reviews.js',{
    '../lib/db':{db:state.db,_:{},C},'../lib/utils':{...utils,now:()=>at},'./plans':{getTodayPlans:async()=>plans}
  })
  await Promise.all([actions.ensureDailyReviewAfterCompletion('u','2026-09-29',plans),actions.createManualDailyReview('u','2026-09-29',plans)])
  const rows=state.read().reviews,id=Object.keys(rows)[0]
  assert.equal(Object.keys(rows).length,1)
  await state.db.collection('reviews').doc(id).update({data:{mood:'GOOD',note:'今天不错'}})
  await actions.revokeDailyReview('u','2026-09-29','p',[{...plans[0],completed:false}])
  let review=state.read().reviews[id]
  assert.equal(review.note,'今天不错');assert.equal(review.allPlansCompleted,false)
  await actions.ensureDailyReviewAfterCompletion('u','2026-09-29',plans)
  review=state.read().reviews[id]
  assert.equal(review.mood,'GOOD');assert.equal(review.note,'今天不错');assert.equal(review.allPlansCompleted,true)
})
function makeupFixture(timerStatus=''){
  const state=database({users:{u:{_id:'u',makeupCardBalance:3}},reviews:{},checkins:{}})
  const plan={_id:'p',userId:'u',name:'昨天背50词',enabled:true,repeatType:'DAILY',targetType:'COUNT',targetValue:50,longTermGoalIds:[],completed:false}
  if(timerStatus){plan.checkin={_id:'old',timerStatus};state.read().checkins.old={_id:'old',userId:'u',planId:'p',date:'2026-09-28',timerStatus}}
  const actions=load('cloudfunctions/api/services/makeup-checkins.js',{
    '../lib/db':{db:state.db,C},'../lib/utils':{...utils,now:()=>at},
    './historical-plans':{loadHistoricalPlans:async()=>({tasks:[plan]})},
    './daily-reviews':{getDailyReview:async(userId,date)=>Object.values(state.read().reviews).find(row=>row.userId===userId && row.date===date)||null},
    '../domain/makeup-cards':{INITIAL_GRANT_VERSION:2,todayForUser:()=> '2026-09-29',previousDate:()=> '2026-09-28',makeupCardState:user=>({balance:user.makeupCardBalance,grantMonth:'2026-09'})},
    './plan-records':{syncPlanCategoryRecord:async()=>{}},'./long-term-goals':{syncLongTermGoalAchievements:async()=>{}}
  })
  const run=()=>actions.makeupDailyCheckin({user:{_id:'u'},event:{makeupDate:'2026-09-28',completedPlanIds:['p'],mood:'',note:''}})
  return {state,run}
}
test('历史补签按昨天数量写入，重复并发不会多扣卡或多建打卡',async()=>{
  const {state,run}=makeupFixture()
  const result=await Promise.allSettled([run(),run()])
  assert.equal(result.filter(item=>item.status==='fulfilled').length,1)
  assert.equal(state.read().users.u.makeupCardBalance,2)
  assert.equal(Object.keys(state.read().checkins).length,1)
  const checkin=Object.values(state.read().checkins)[0]
  assert.equal(checkin.actualValue,50);assert.equal(checkin.planSnapshot.name,'昨天背50词')
  assert.equal(Object.values(state.read().reviews)[0].allPlansCompleted,true)
})
test('补签活动计时被拒绝，失败不扣卡、不创建整日记录',async()=>{
  const {state,run}=makeupFixture('RUNNING')
  await assert.rejects(run(),error=>error.code==='TIMER_ACTIVE')
  assert.equal(state.read().users.u.makeupCardBalance,3)
  assert.equal(Object.keys(state.read().reviews).length,0)
})
test('初始化未配置令牌或令牌错误时默认关闭，不访问业务集合',async()=>{
  let writes=0
  const actions=load('cloudfunctions/admin-init/index.js',{
    'wx-server-sdk':{init(){},database:()=>({collection(){writes++;throw new Error('unexpected database access')}})},
    './seed-data':{foods:[],exercises:[],bodyMetrics:[],appConfig:[]}
  },{process:{env:{}}})
  assert.equal((await actions.main({})).code,'ADMIN_INIT_DISABLED')
  const protectedActions=load('cloudfunctions/admin-init/index.js',{
    'wx-server-sdk':{init(){},database:()=>({collection(){writes++;throw new Error('unexpected database access')}})},
    './seed-data':{foods:[],exercises:[],bodyMetrics:[],appConfig:[]}
  },{process:{env:{ADMIN_INIT_TOKEN:'test-only-token'}}})
  assert.equal((await protectedActions.main({token:'wrong'})).code,'FORBIDDEN')
  assert.equal(writes,0)
})
