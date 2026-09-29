const test = require('node:test')
const assert = require('node:assert/strict')
const { recordExecutionHistory,executionSnapshot,completionSnapshots } = require('../cloudfunctions/api/domain/execution-history')
const { buildProgressReport,dateRange } = require('../cloudfunctions/api/domain/progress-report')
const { comparison } = require('../cloudfunctions/api/domain/review-summary')

test('数量目标当天完成后托管任务归档，最后一次执行不会从报告中消失', () => {
  const plan = { _id:'p',name:'背单词',enabled:true,repeatType:'DAILY',category:'STUDY',createdAt:'2026-09-01' }
  plan.scheduleHistory = recordExecutionHistory(plan,{},'2026-09-01')
  const snapshot = executionSnapshot(plan)
  plan.scheduleHistory = recordExecutionHistory(plan,{ enabled:false,deletedAt:'2026-09-27' },'2026-09-27')
  plan.enabled = false; plan.deletedAt = '2026-09-27'
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[plan],checkins:[{ planId:'p',date:'2026-09-27',completed:true,planSnapshot:snapshot }] })
  assert.equal(report.summary.scheduledTasks,7)
  assert.equal(report.summary.scheduledCompletedTasks,1)
})
test('健身分类使用真实 WORKOUT 枚举，超过周目标的完成率也不大于100%', () => {
  const plan = { _id:'p',name:'健身',enabled:true,repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:2 },category:'WORKOUT',createdAt:'2026-09-01' }
  plan.scheduleHistory = recordExecutionHistory(plan,{},'2026-09-01')
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[plan],checkins:['2026-09-21','2026-09-22','2026-09-23'].map(date => ({ planId:'p',date,completed:true })) })
  assert.equal(report.details.categories[0].key,'WORKOUT')
  assert.equal(report.details.categories[0].rate,100)
  assert.equal(report.summary.completionRate,100)
  assert.equal(report.tasks[0].completed,3)
})
test('历史覆盖不足不比较完成率；月报每周变化只合计实际记录', () => {
  const current = buildProgressReport({ dates:dateRange('2026-09-30',30),checkins:[{ planId:'p',date:'2026-09-22',completed:true,timerEffectiveSeconds:600 }],dailyReviews:[{ date:'2026-09-22',completedPlanCount:1,totalPlanCount:1 }] })
  const previous = { days:31,summary:{ completionRate:50 } }
  assert.equal(comparison(current,previous).completionRate,null)
  assert.equal(current.details.weeks.reduce((sum,item) => sum + item.completedTasks,0),1)
  assert.equal(current.details.weeks.reduce((sum,item) => sum + item.focusMinutes,0),10)
})
test('旧打卡的每日任务总数不与已经核实的每周次数重复累计', () => {
  const daily = { _id:'daily',name:'旧每日任务',enabled:true,repeatType:'DAILY',createdAt:'2026-09-01',updatedAt:'2026-09-28' }
  const weekly = { _id:'weekly',name:'每周运动',enabled:true,repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:3 },createdAt:'2026-09-01' }
  weekly.scheduleHistory = recordExecutionHistory(weekly,{},'2026-09-01')
  const report = buildProgressReport({
    dates:dateRange('2026-09-27',7),plans:[daily,weekly],
    checkins:[{ planId:'weekly',date:'2026-09-21',completed:true }],
    dailyReviews:[{ date:'2026-09-21',completedPlanCount:2,totalPlanCount:2 }]
  })
  assert.equal(report.summary.scheduledTasks,3)
  assert.equal(report.summary.scheduledCompletedTasks,1)
  assert.equal(report.summary.completionRate,33)
  assert.equal(report.summary.unknownScheduleDays,7)
})
test('已完成任务编辑备注保留原执行快照，撤回后重新完成才使用新关联', () => {
  const plan = { name:'新名称',longTermGoalIds:['new-goal'] }
  const existing = { completed:true,planSnapshot:{ name:'原名称',longTermGoalIds:['old-goal'] },longTermGoalIdsSnapshot:['old-goal'] }
  assert.deepEqual(completionSnapshots(plan,existing),{
    planSnapshot:existing.planSnapshot,longTermGoalIdsSnapshot:['old-goal']
  })
  assert.deepEqual(completionSnapshots(plan,{ completed:true }),{ planSnapshot:null,longTermGoalIdsSnapshot:null })
  const redone = completionSnapshots(plan,{ ...existing,completed:false })
  assert.equal(redone.planSnapshot.name,'新名称')
  assert.deepEqual(redone.longTermGoalIdsSnapshot,['new-goal'])
})
