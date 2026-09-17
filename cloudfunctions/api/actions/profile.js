const { db, C } = require('../lib/db')
const { now, fail, sanitizeNumber } = require('../lib/utils')
const { getUserById, getPrivacy, getNutritionProfile } = require('../services/users')
const { latestWeight, weightStatus, currentNutritionTarget, recalcNutritionTarget } = require('../services/nutrition')
const { homePreferencesOf } = require('../services/preferences')
const { isFeedbackAdmin } = require('../services/feedback-admin')

async function getProfile({ user, localDate }) {
  const [nutritionProfile, privacy, weight] = await Promise.all([getNutritionProfile(user._id), getPrivacy(user._id), latestWeight(user._id)])
  return {
    user: { ...user, homePreferences: homePreferencesOf(user) }, nutritionProfile, privacy,
    weightStatus: weightStatus(weight, localDate),
    latestWeight: weight || null,
    isFeedbackAdmin: isFeedbackAdmin(user)
  }
}

async function updateHomePreferences({ user, event }) {
  const input = event.preferences || {}
  const homePreferences = {
    showEnergy: input.showEnergy !== false
  }
  await db.collection(C.USERS).doc(user._id).update({ data: { homePreferences, updatedAt: now() } })
  return { homePreferences }
}

async function updateProfile({ user, event, localDate }) {
  const profile = event.profile || {}
  const allowed = ['nickname', 'avatar', 'sex', 'birthday', 'heightCm']
  const data = { updatedAt: now() }
  allowed.forEach(key => { if (profile[key] !== undefined) data[key] = profile[key] })
  if (data.heightCm !== undefined) {
    const height = sanitizeNumber(data.heightCm, 80, 250)
    if (height == null) throw fail('INVALID_PARAMETER', '身高不合法')
    data.heightCm = height
  }
  if (data.sex !== undefined && !['MALE', 'FEMALE'].includes(data.sex)) throw fail('INVALID_PARAMETER', '性别参数不合法')
  await db.collection(C.USERS).doc(user._id).update({ data })

  if (event.nutritionProfile) {
    const input = event.nutritionProfile
    const current = await db.collection(C.NUTRITION_PROFILES).where({ userId: user._id }).limit(1).get()
    const goalType = ['FAT_LOSS', 'MAINTAIN', 'MUSCLE_GAIN'].includes(input.goalType) ? input.goalType : 'FAT_LOSS'
    const nutritionData = {
      goalType,
      baseActivityLevel: ['SEDENTARY', 'LIGHT', 'MODERATE'].includes(input.baseActivityLevel) ? input.baseActivityLevel : 'SEDENTARY',
      weeklyExerciseFrequency: Math.max(0, Math.min(14, Number(input.weeklyExerciseFrequency || 0))),
      proteinRatio: Math.max(0.5, Math.min(4, Number(input.proteinRatio || 1.6))),
      fatRatio: Math.max(0.2, Math.min(3, Number(input.fatRatio || 0.8))),
      targetCalorieAdjustment: Math.max(-1500, Math.min(1500, Number(input.targetCalorieAdjustment ?? (goalType === 'MUSCLE_GAIN' ? 200 : goalType === 'MAINTAIN' ? 0 : -300)))),
      updatedAt: now()
    }
    if (current.data.length) await db.collection(C.NUTRITION_PROFILES).doc(current.data[0]._id).update({ data: nutritionData })
    else await db.collection(C.NUTRITION_PROFILES).add({ data: { userId: user._id, ...nutritionData } })
  }

  const refreshed = await getUserById(user._id)
  return { user: refreshed, nutritionTarget: await recalcNutritionTarget(refreshed, localDate) }
}

async function getNutritionTarget({ user, localDate }) {
  const [target, weight] = await Promise.all([currentNutritionTarget(user._id), latestWeight(user._id)])
  return { target, weightStatus: weightStatus(weight, localDate) }
}

module.exports = { getProfile, updateProfile, getNutritionTarget, updateHomePreferences }
