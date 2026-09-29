const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

async function complete(existing, event = {}) {
  const plan = { _id:'p',userId:'u',name:'修改后的任务',enabled:true,repeatType:'DAILY',targetValue:100,longTermGoalIds:['new-goal'] }
  let saved
  const db = { collection(name) {
    const query = {
      where() { return query },limit() { return query },
      async get() { return { data:[existing] } },
      doc() { return {
        async get() { return { data:plan } },
        async update({ data }) { saved = data }
      } }
    }
    return query
  } }
  const mocks = {
    '../lib/db':{ db,C:{ PLANS:'plans',CHECKINS:'checkins' } },
    '../lib/utils':{ now:() => new Date('2026-09-29T00:00:00Z') },
    '../services/plans':{ isBasePlanDue:() => true,getTodayPlans:async () => [] },
    '../services/social':{ emitGroupEventsForCheckin:async () => {} },
    '../services/plan-records':{ syncPlanCategoryRecord:async () => {} },
    '../services/daily-reviews':{ ensureDailyReviewAfterCompletion:async () => null },
    '../services/long-term-goals':{ syncLongTermGoalAchievements:async () => ({ achievedGoals:[] }) },
    '../services/group-plan-changes':{},'../services/group-plan-broadcasts':{},'../services/managed-accumulation':{},
    '../domain/makeup-cards':{ todayForUser:() => '2026-09-29' }
  }
  const filename = path.join(__dirname,'../cloudfunctions/api/actions/plans.js')
  const realRequire = createRequire(filename), module = { exports:{} }
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    require:name => Object.hasOwn(mocks,name) ? mocks[name] : realRequire(name),module,exports:module.exports,console
  },{ filename })
  await module.exports.completePlan({ user:{ _id:'u' },event:{ planId:'p',note:'补充小记',...event },localDate:'2026-09-29' })
  return saved
}

test('编辑已完成任务的小记不改变原数量或目标关联', async () => {
  const existing = { _id:'c',completed:true,actualValue:50,completedAt:'2026-09-29T00:00:00Z',planSnapshot:{ name:'原任务' },longTermGoalIdsSnapshot:['old-goal'] }
  const saved = await complete(existing)
  assert.equal(saved.actualValue,50)
  assert.equal(saved.note,'补充小记')
  assert.equal(saved.planSnapshot.name,'原任务')
  assert.deepEqual(saved.longTermGoalIdsSnapshot,['old-goal'])
})
test('撤回后重新完成使用当前任务数量与目标，显式修改完成量仍生效', async () => {
  const existing = { _id:'c',completed:false,actualValue:50,planSnapshot:{ name:'原任务' },longTermGoalIdsSnapshot:['old-goal'] }
  const saved = await complete(existing)
  assert.equal(saved.actualValue,100)
  assert.equal(saved.planSnapshot.name,'修改后的任务')
  assert.deepEqual(saved.longTermGoalIdsSnapshot,['new-goal'])
  assert.equal((await complete({ ...existing,completed:true },{ actualValue:60 })).actualValue,60)
})
