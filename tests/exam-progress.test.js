const test=require('node:test')
const assert=require('node:assert/strict')
const { preparationDays,examArchiveDue,examProgressSnapshot }=require('../cloudfunctions/api/domain/exam-progress')

test('备考天数包含创建日和考试日',() => {
  assert.equal(preparationDays('2026-09-20','2026-09-22'),3)
  assert.equal(preparationDays('2026-09-22','2026-09-22'),1)
  assert.equal(examArchiveDue({
    planType:'LONG_TERM',goalType:'DEADLINE',goalStatus:'ACTIVE',enabled:true,deadlineDate:'2026-09-22'
  },'2026-09-22'),true)
})

test('考试归档快照冻结关联任务、完成次数、学习时长和完成率',() => {
  const goal={ _id:'exam',startDate:'2026-09-20',deadlineDate:'2026-09-22' }
  const plans=[
    { _id:'daily',name:'每天背单词',category:'STUDY',repeatType:'DAILY',startDate:'2026-09-20',longTermGoalIds:['exam'] },
    { _id:'other',name:'无关任务',repeatType:'DAILY',startDate:'2026-09-20',longTermGoalIds:[] }
  ]
  const checkins=[
    { planId:'daily',date:'2026-09-20',completed:true,durationMinutes:30 },
    { planId:'daily',date:'2026-09-22',completed:true,timerEffectiveSeconds:3600 },
    { planId:'daily',date:'2026-09-23',completed:true,durationMinutes:90 },
    { planId:'other',date:'2026-09-21',completed:true,durationMinutes:20 }
  ]
  assert.deepEqual(examProgressSnapshot(goal,plans,checkins),{
    createdDate:'2026-09-20',examDate:'2026-09-22',preparationDays:3,
    linkedPlans:[{ _id:'daily',name:'每天背单词',category:'STUDY' }],linkedPlanCount:1,
    completedCount:2,durationMinutes:90,scheduledCount:3,scheduledCompletedCount:2,completionPct:67
  })
})

test('已经解除绑定的历史任务仍保留在考试历程中',() => {
  const goal={
    _id:'exam',startDate:'2026-09-20',deadlineDate:'2026-09-20',
    linkedPlanHistory:[{ planId:'history',name:'旧名称' }]
  }
  const plans=[{
    _id:'history',name:'英语真题',category:'STUDY',targetType:'DURATION',targetValue:45,
    repeatType:'DAILY',startDate:'2026-09-20',longTermGoalIds:[]
  }]
  const snapshot=examProgressSnapshot(goal,plans,[{
    planId:'history',date:'2026-09-20',completed:true,actualValue:45
  }])
  assert.equal(snapshot.linkedPlanCount,1)
  assert.equal(snapshot.linkedPlans[0].name,'英语真题')
  assert.equal(snapshot.durationMinutes,45)
  assert.equal(snapshot.completionPct,100)
})
