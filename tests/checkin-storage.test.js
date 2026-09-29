const test=require('node:test')
const assert=require('node:assert/strict')
const { executionCheckinId,saveExecutionCheckin }=require('../cloudfunctions/api/services/checkin-storage')
const { completionRecord }=require('../cloudfunctions/api/domain/completion-record')
function database(plan,initial={}) {
  let records={ plans:{ p:plan },checkins:initial }, queue=Promise.resolve()
  const db={ runTransaction(callback) {
    const job=queue.then(async () => {
      const copy=structuredClone(records)
      const transaction={ collection:name => ({ doc:id => ({
        async get(){ if(!copy[name]?.[id])throw new Error('not found');return {data:structuredClone(copy[name][id])} },
        async set({data}){copy[name][id]={...data,_id:id}},
        async update({data}){Object.assign(copy[name][id],data)}
      }) }) }
      const result=await callback(transaction);records=copy;return { result }
    })
    queue=job.catch(() => {});return job
  } }
  return { db,read:() => records }
}
const plan={ _id:'p',userId:'u',name:'阅读',enabled:true,repeatType:'DAILY',targetValue:1 }
const C={ PLANS:'plans',CHECKINS:'checkins' }
test('并发完成同一任务只创建一条记录，只有一次首次完成事件',async () => {
  const state=database(plan)
  const run=() => saveExecutionCheckin({ db:state.db,C,userId:'u',planId:'p',date:'2026-09-29',build:(existing,current) => completionRecord(current,existing,{},new Date('2026-09-29T00:00:00Z'),'2026-09-29') })
  const result=await Promise.all([run(),run(),run()])
  assert.equal(Object.keys(state.read().checkins).length,1)
  assert.equal(result.filter(item => !item.wasCompleted).length,1)
  assert.equal(result[0].checkin._id,executionCheckinId('u','p','2026-09-29'))
  assert.equal(result[2].checkin.completionVersion,1)
})
test('旧随机标识的记录原地更新；失败事务不留下半条记录',async () => {
  const existing={ _id:'legacy',userId:'u',planId:'p',date:'2026-09-29',completed:true,note:'原备注',actualValue:50 }
  const state=database(plan,{legacy:existing})
  await saveExecutionCheckin({ db:state.db,C,userId:'u',planId:'p',date:'2026-09-29',existingId:'legacy',build:current => ({note:current.note,updatedAt:new Date()}) })
  assert.deepEqual(Object.keys(state.read().checkins),['legacy'])
  await assert.rejects(saveExecutionCheckin({db:state.db,C,userId:'u',planId:'p',date:'2026-09-30',build:() => {throw new Error('invalid')}}),/invalid/)
  assert.equal(Object.keys(state.read().checkins).length,1)
})
test('跨用户记录拒绝修改；仅自动完成归档的托管任务允许当日撤回',async () => {
  const state=database({...plan,deletedAt:'2026-09-29',managedByGoalId:'goal',managedLifecycleStatus:'COMPLETED'})
  await assert.rejects(saveExecutionCheckin({db:state.db,C,userId:'u',planId:'p',date:'2026-09-29',build:() => ({updatedAt:new Date()})}),error=>error.code==='PLAN_NOT_FOUND')
  const result=await saveExecutionCheckin({db:state.db,C,userId:'u',planId:'p',date:'2026-09-29',allowManagedArchive:true,build:() => ({completed:false,updatedAt:new Date()})})
  assert.equal(result.checkin.completed,false)
  await assert.rejects(saveExecutionCheckin({db:state.db,C,userId:'other',planId:'p',date:'2026-09-29',allowManagedArchive:true,build:() => ({updatedAt:new Date()})}),error=>error.code==='PLAN_NOT_FOUND')
})
