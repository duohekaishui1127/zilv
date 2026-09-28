const { db, C } = require('../lib/db')
const { DEFAULT_PRIVACY } = require('../lib/constants')
const { now, randomCode } = require('../lib/utils')
const { ensureDefaultAdminFriendship } = require('./default-admin-friend')
const { INITIAL_CARDS, INITIAL_GRANT_VERSION, todayForUser } = require('../domain/makeup-cards')
const { betaEnrollmentFields, identityCode } = require('../domain/membership')

function betaEnrollmentEnabled() { return String(process.env.BETA_ENROLLMENT_ENABLED || 'true').toLowerCase() !== 'false' }
function defaultAdminFriendEnabled() { return String(process.env.DEFAULT_ADMIN_FRIEND_ENABLED || 'false').toLowerCase() === 'true' }

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
    let user = r.data[0]
    user = await ensureProductIdentity(user)
    if (defaultAdminFriendEnabled() && !user.defaultAdminFriendshipInitialized) return initializeDefaultAdminFriendship(user)
    return user
  }

  const shareCode = await uniqueCode(C.USERS, 'shareCode')
  const data = {
    openid,
    nickname: '自律用户',
    makeupCardBalance: INITIAL_CARDS,
    makeupCardGrantMonth: todayForUser().slice(0, 7),
    makeupCardInitialGrantVersion: INITIAL_GRANT_VERSION,
    avatar: '',
    shareCode,
    identityCode: `ZL-${shareCode}`,
    status: 'ACTIVE',
    createdAt: now(),
    updatedAt: now()
  }
  if (betaEnrollmentEnabled()) Object.assign(data, betaEnrollmentFields(data, data.createdAt))
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

  return defaultAdminFriendEnabled() ? initializeDefaultAdminFriendship(user) : user
}

async function findUserByOpenid(openid) {
  if (!openid) return null
  const result = await db.collection(C.USERS).where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function ensureProductIdentity(user) {
  const data = {}
  const code = identityCode(user)
  if (user.identityCode !== code) data.identityCode = code
  if (betaEnrollmentEnabled() && (!user.betaUser || !user.betaStartedAt || !user.betaExpiresAt)) Object.assign(data, betaEnrollmentFields(user, now()))
  if (!Object.keys(data).length) return user
  data.updatedAt = now()
  await db.collection(C.USERS).doc(user._id).update({ data })
  return { ...user, ...data }
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

module.exports = { uniqueCode, ensureUser, ensureProductIdentity, findUserByOpenid, getUserById, getPrivacy, getNutritionProfile }
