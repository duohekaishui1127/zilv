const { db, C } = require('../lib/db')
const { DEFAULT_PRIVACY } = require('../lib/constants')
const { now } = require('../lib/utils')
const { getPrivacy } = require('../services/users')

async function updatePrivacy({ user, event }) {
  const current = await getPrivacy(user._id)
  const data = { updatedAt: now() }
  Object.keys(DEFAULT_PRIVACY).forEach(key => {
    if (event.privacy?.[key] !== undefined) data[key] = !!event.privacy[key]
  })
  await db.collection(C.PRIVACY).doc(current._id).update({ data })
  return { privacy: { ...current, ...data } }
}

module.exports = { updatePrivacy }
