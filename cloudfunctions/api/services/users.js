const { db, C } = require('../lib/db')
const { DEFAULT_PRIVACY } = require('../lib/constants')
const { now, randomCode } = require('../lib/utils')
const { ensureDefaultAdminFriendship } = require('./default-admin-friend')

async function uniqueCode(collection, field, len = 6) {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(len)
    const r = await db.collection(collection).where({ [field]: code }).limit(1).get()
    if (!r.data.length) return code
  }
  return `${randomCode(len)}${Date.now().toString().slice(-2)}`
}

async function ensureUser(openid) {
  const r = await db.collection(C.USERS).where({ openid }).limit(1).get()
  if (r.data.length) {
    const user = r.data[0]
    if (!user.defaultAdminFriendshipInitialized) return initializeDefaultAdminFriendship(user)
    return user
  }

  const shareCode = await uniqueCode(C.USERS, 'shareCode')
  const data = {
    openid,
    nickname: '自律用户',
    avatar: '',
    shareCode,
    status: 'ACTIVE',
    createdAt: now(),
    updatedAt: now()
  }
  const added = await db.collection(C.USERS).add({ data })
  const user = { _id: added._id, ...data }

  await Promise.all([
    db.collection(C.PRIVACY).add({ data: { userId: user._id, ...DEFAULT_PRIVACY, createdAt: now(), updatedAt: now() } }),
    db.collection(C.NUTRITION_PROFILES).add({ data: {
      userId: user._id,
      goalType: 'FAT_LOSS',
      baseActivityLevel: 'SEDENTARY',
      weeklyExerciseFrequency: 3,
      proteinRatio: 1.6,
      fatRatio: 0.8,
      targetCalorieAdjustment: -300,
      updatedAt: now()
    } })
  ])

  return initializeDefaultAdminFriendship(user)
}

async function initializeDefaultAdminFriendship(user) {
  try {
    const result = await ensureDefaultAdminFriendship(user)
    if (!result.configured || !result.adminFound) return user
    const data = {
      defaultAdminFriendshipInitialized: true,
      defaultAdminUserId: result.adminUserId,
      defaultAdminFriendshipInitializedAt: now(),
      updatedAt: now()
    }
    await db.collection(C.USERS).doc(user._id).update({ data })
    return { ...user, ...data }
  } catch (error) {
    console.warn('[default-admin-friend]', error?.message || error)
    return user
  }
}

async function getUserById(id) {
  try { return (await db.collection(C.USERS).doc(id).get()).data } catch (e) { return null }
}

async function getPrivacy(userId) {
  const r = await db.collection(C.PRIVACY).where({ userId }).limit(1).get()
  if (r.data.length) return r.data[0]
  const data = { userId, ...DEFAULT_PRIVACY, createdAt: now(), updatedAt: now() }
  const added = await db.collection(C.PRIVACY).add({ data })
  return { _id: added._id, ...data }
}

async function getNutritionProfile(userId) {
  const r = await db.collection(C.NUTRITION_PROFILES).where({ userId }).limit(1).get()
  return r.data[0] || null
}

module.exports = { uniqueCode, ensureUser, getUserById, getPrivacy, getNutritionProfile }
