const { db, C } = require('../lib/db')

const NOTIFICATION_LIMIT = 20

async function trimNotificationHistory(userId, keep = NOTIFICATION_LIMIT) {
  let removed = 0
  while (true) {
    const overflow = await db.collection(C.NOTIFICATIONS)
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .skip(keep)
      .limit(100)
      .get()
    if (!overflow.data.length) break
    await Promise.all(overflow.data.map(item => db.collection(C.NOTIFICATIONS).doc(item._id).remove()))
    removed += overflow.data.length
  }
  return removed
}

async function notificationWindow(userId) {
  const result = await db.collection(C.NOTIFICATIONS)
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .limit(NOTIFICATION_LIMIT)
    .get()
  await trimNotificationHistory(userId)
  return {
    notifications: result.data,
    unreadCount: result.data.filter(item => item.status === 'UNREAD').length
  }
}

module.exports = { NOTIFICATION_LIMIT, trimNotificationHistory, notificationWindow }
