const { ageFromBirthday } = require('../lib/utils')

function calculateNutrition({ weightKg, heightCm, birthday, sex, profile, at = new Date() }) {
  const age = ageFromBirthday(birthday, at)
  if (!weightKg || !heightCm || !age || !['MALE', 'FEMALE'].includes(sex)) return null

  const bmr = sex === 'MALE'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161

  // 活动系数只描述基础生活活动；主动运动由当天运动记录额外计算，避免重复计入。
  const activityMap = { SEDENTARY: 1.2, LIGHT: 1.3, MODERATE: 1.4 }
  const baseDailyExpenditure = bmr * (activityMap[profile.baseActivityLevel] || 1.2)
  const defaults = { FAT_LOSS: -300, MAINTAIN: 0, MUSCLE_GAIN: 200 }
  const adjustmentValue = Number(profile.targetCalorieAdjustment)
  const adjustment = Number.isFinite(adjustmentValue) ? adjustmentValue : (defaults[profile.goalType] || 0)
  const targetCalories = Math.max(0, Math.round(baseDailyExpenditure + adjustment))
  const proteinGram = Math.round(weightKg * (Number(profile.proteinRatio) || 1.6))
  const fatGram = Math.round(weightKg * (Number(profile.fatRatio) || 0.8))
  const carbGram = Math.max(0, Math.round((targetCalories - proteinGram * 4 - fatGram * 9) / 4))

  return {
    bmr: Math.round(bmr),
    baseDailyExpenditure: Math.round(baseDailyExpenditure),
    targetCalories,
    proteinGram,
    carbGram,
    fatGram,
    calculationVersion: 'NUTRITION_V2'
  }
}

module.exports = { calculateNutrition }
