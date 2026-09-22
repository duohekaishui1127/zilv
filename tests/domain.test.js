const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateNutrition } = require('../cloudfunctions/api/domain/nutrition-calculator')
const { isBasePlanDue } = require('../cloudfunctions/api/domain/plan-schedule')
const { decorateGoal } = require('../cloudfunctions/api/domain/long-term-goal')
const { canSharePlanWithFriend } = require('../cloudfunctions/api/domain/friend-privacy')

const profile = {
  goalType: 'FAT_LOSS',
  baseActivityLevel: 'SEDENTARY',
  proteinRatio: 1.6,
  fatRatio: 0.8,
  targetCalorieAdjustment: -300
}

test('营养计算返回稳定的三大营养目标', () => {
  const result = calculateNutrition({
    weightKg: 75,
    heightCm: 175,
    birthday: '2000-01-01',
    sex: 'MALE',
    profile,
    at: new Date('2026-09-16T12:00:00')
  })
  assert.equal(result.proteinGram, 120)
  assert.equal(result.fatGram, 60)
  assert.ok(result.bmr > 1000)
  assert.ok(result.targetCalories > 0)
  assert.ok(result.carbGram >= 0)
})

test('指定星期计划只在对应日期到期', () => {
  const plan = {
    repeatType: 'SPECIFIC_WEEKDAYS',
    repeatConfig: { weekdays: [1, 3, 5] },
    startDate: '2026-09-01'
  }
  assert.equal(isBasePlanDue(plan, '2026-09-14'), true)  // 周一
  assert.equal(isBasePlanDue(plan, '2026-09-15'), false) // 周二
  assert.equal(isBasePlanDue(plan, '2026-09-16'), true)  // 周三
})

test('结束日期后的计划不再到期', () => {
  const plan = { repeatType: 'DAILY', startDate: '2026-09-01', endDate: '2026-09-10' }
  assert.equal(isBasePlanDue(plan, '2026-09-11'), false)
})

test('一次性任务只在指定日期执行，长期目标永不到期', () => {
  assert.equal(isBasePlanDue({ repeatType:'ONE_TIME',startDate:'2026-09-22' },'2026-09-22'),true)
  assert.equal(isBasePlanDue({ repeatType:'ONE_TIME',startDate:'2026-09-22' },'2026-09-23'),false)
  assert.equal(isBasePlanDue({ planType:'LONG_TERM',repeatType:'DAILY',startDate:'2026-09-01' },'2026-09-22'),false)
})

test('累计目标和习惯目标由关联执行任务打卡自动计算', () => {
  const plans=[{ _id:'task',repeatType:'DAILY',startDate:'2026-09-01',longTermGoalIds:['words','habit'] }]
  const checkins=[
    { planId:'task',date:'2026-09-20',completed:true,actualValue:40 },
    { planId:'task',date:'2026-09-21',completed:true,actualValue:50 },
    { planId:'task',date:'2026-09-22',completed:true,actualValue:60 }
  ]
  const words=decorateGoal({ _id:'words',planType:'LONG_TERM',goalType:'ACCUMULATION',targetValue:500,unit:'词',goalStatus:'ACTIVE' },plans,checkins,'2026-09-22')
  const habit=decorateGoal({ _id:'habit',planType:'LONG_TERM',goalType:'HABIT',habitDays:21,goalStatus:'ACTIVE' },plans,checkins,'2026-09-22')
  assert.equal(words.currentValue,150)
  assert.equal(words.progressPct,30)
  assert.equal(habit.currentValue,3)
  assert.deepEqual(habit.todayProgress,{ completed:1,total:1 })
  const newGoal=decorateGoal({ _id:'words',planType:'LONG_TERM',goalType:'ACCUMULATION',startDate:'2026-09-21',unlimited:true,unit:'词',goalStatus:'ACTIVE' },plans,checkins,'2026-09-22')
  assert.equal(newGoal.currentValue,110)
})

test('长期目标始终不向好友公开', () => {
  assert.equal(canSharePlanWithFriend({ planType:'LONG_TERM',category:'STUDY' },{
    showPlanStatusToFriends:true,showStudyStatusToFriends:true
  }),false)
})
