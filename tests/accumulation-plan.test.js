const test=require('node:test')
const assert=require('node:assert/strict')
const {
  remainingExecutionCount,recommendedTargetValue,managedPlanOf,accumulationArchiveSnapshot
}=require('../cloudfunctions/api/domain/accumulation-plan')

function goal(overrides={}) {
  return {
    _id:'words',goalType:'ACCUMULATION',startDate:'2026-01-01',
    accumulationDeadlineDate:'2026-04-10',targetValue:5000,currentValue:0,unit:'词',
    ...overrides
  }
}

function plan(overrides={}) {
  return {
    _id:'daily-words',managedByGoalId:'words',repeatType:'DAILY',repeatConfig:{},
    startDate:'2026-01-01',targetValue:1,unit:'词',...overrides
  }
}

test('100天5000词的每日任务自动建议每次50词',() => {
  const executionPlan=plan()
  assert.equal(remainingExecutionCount(executionPlan,[],'2026-01-01','2026-04-10'),100)
  assert.equal(recommendedTargetValue(goal(),executionPlan,[],'2026-01-01'),50)
})

test('已完成数量和日期不会再次进入未来建议量',() => {
  const executionPlan=plan()
  const checkins=Array.from({ length:10 },(_,index) => ({
    planId:executionPlan._id,completed:true,date:`2026-01-${String(index + 1).padStart(2,'0')}`,actualValue:50
  }))
  assert.equal(remainingExecutionCount(executionPlan,checkins,'2026-01-11','2026-04-10'),90)
  assert.equal(recommendedTargetValue(goal({ currentValue:500 }),executionPlan,checkins,'2026-01-11'),50)
})

test('改为每周三次后自动提高每次建议数量',() => {
  const executionPlan=plan({ repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:3 } })
  const executions=remainingExecutionCount(executionPlan,[],'2026-01-01','2026-04-10')
  assert.equal(executions,45)
  assert.equal(recommendedTargetValue(goal(),executionPlan,[],'2026-01-01'),112)
})

test('无上限积累保留用户设置的每次默认数量',() => {
  const executionPlan=plan({ targetValue:25 })
  assert.equal(recommendedTargetValue(goal({ unlimited:true,targetValue:null }),executionPlan,[],'2026-01-01'),25)
})

test('归档快照冻结托管任务和累计成果',() => {
  const executionPlan=plan({ name:'背单词' })
  const archivedGoal=goal({
    managedExecutionPlanId:executionPlan._id,currentValue:5000,totalCompletedCount:100,totalDurationMinutes:800
  })
  assert.equal(managedPlanOf(archivedGoal,[executionPlan]),executionPlan)
  assert.deepEqual(accumulationArchiveSnapshot(archivedGoal,[executionPlan],'2026-04-10','ACHIEVED'),{
    createdDate:'2026-01-01',completedDate:'2026-04-10',outcome:'ACHIEVED',unlimited:false,
    targetValue:5000,accumulatedValue:5000,unit:'词',completedCount:100,durationMinutes:800,
    executionPlan:{
      _id:'daily-words',name:'背单词',category:'CUSTOM',repeatType:'DAILY',repeatConfig:{},targetValue:1,unit:'词'
    }
  })
})
