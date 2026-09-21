const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const {
  configuredDefaultAdminShareCode,
  defaultAdminFriendshipData
} = require('../domain/default-admin-friend')

function configuredShareCode(explicitShareCode) {
  return configuredDefaultAdminShareCode(
    explicitShareCode || process.env.DEFAULT_FRIEND_ADMIN_SHARE_CODE,
    process.env.FEEDBACK_ADMIN_SHARE_CODES
  )
}

async function friendshipBetween(userA, userB) {
  const [forward, reverse] = await Promise.all([
    db.collection(C.FRIENDSHIPS).where({ userA, userB }).limit(1).get(),
    db.collection(C.FRIENDSHIPS).where({ userA: userB, userB: userA }).limit(1).get()
  ])
  return forward.data[0] || reverse.data[0] || null
}

async function ensureDefaultAdminFriendship(user, explicitShareCode) {
  const shareCode = configuredShareCode(explicitShareCode)
  if (!shareCode) return { configured: false, created: false, updated: false }

  const adminResult = await db.collection(C.USERS).where({ shareCode, status: 'ACTIVE' }).limit(1).get()
  const admin = adminResult.data[0]
  if (!admin) return { configured: true, adminFound: false, shareCode, created: false, updated: false }
  if (admin._id === user._id) {
    return { configured: true, adminFound: true, self: true, adminUserId: admin._id, created: false, updated: false }
  }

  const timestamp = now()
  const existing = await friendshipBetween(admin._id, user._id)
  const data = defaultAdminFriendshipData(admin._id, user._id, timestamp, existing)
  if (existing) {
    await db.collection(C.FRIENDSHIPS).doc(existing._id).update({ data })
    return { configured: true, adminFound: true, adminUserId: admin._id, friendshipId: existing._id, created: false, updated: true }
  }

  const added = await db.collection(C.FRIENDSHIPS).add({ data: { ...data, createdAt: timestamp } })
  return { configured: true, adminFound: true, adminUserId: admin._id, friendshipId: added._id, created: true, updated: false }
}

module.exports = { configuredShareCode, ensureDefaultAdminFriendship }
