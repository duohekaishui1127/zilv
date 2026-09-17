const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const announcement = require('../config/release-announcement')

function notificationId(userId, announcementId) {
  return crypto.createHash('sha256').update(`release:${userId}:${announcementId}`).digest('hex').slice(0, 32)
}

async function document(id) {
  try { return (await db.collection(C.NOTIFICATIONS).doc(id).get()).data } catch (error) { return null }
}

async function ensureReleaseAnnouncement(user) {
  const id = String(announcement.id || '').trim()
  const version = String(announcement.version || '').trim()
  const title = String(announcement.title || '').trim()
  const content = String(announcement.content || '').trim()
  if (!announcement.enabled || !id || !title || !content) return { created: false, enabled: false }

  const notificationIdValue = notificationId(user._id, id)
  if (await document(notificationIdValue)) return { created: false, enabled: true }
  const timestamp = now()
  await db.collection(C.NOTIFICATIONS).doc(notificationIdValue).set({ data: {
    userId: user._id,
    type: 'RELEASE_ANNOUNCEMENT',
    announcementId: id,
    releaseVersion: version,
    title: `${title}${version ? ` · v${version}` : ''}`.slice(0, 80),
    content: content.slice(0, 1000),
    status: 'UNREAD',
    pushStatus: 'INTERNAL_ONLY',
    createdAt: timestamp,
    updatedAt: timestamp
  } })
  return { created: true, enabled: true }
}

module.exports = { ensureReleaseAnnouncement }
