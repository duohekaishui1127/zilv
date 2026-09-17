const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateNutrition } = require('../cloudfunctions/api/domain/nutrition-calculator')
const { isBasePlanDue } = require('../cloudfunctions/api/domain/plan-schedule')

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
