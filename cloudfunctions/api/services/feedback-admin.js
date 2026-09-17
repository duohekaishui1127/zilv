const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')

function configuredAdminCodes() {
  return [...new Set(String(process.env.FEEDBACK_ADMIN_SHARE_CODES || '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean))]
}

function isFeedbackAdmin(user) {
  return configuredAdminCodes().includes(String(user.shareCode || '').toUpperCase())
}

function assertFeedbackAdmin(user) {
  if (!isFeedbackAdmin(user)) throw fail('FORBIDDEN', '仅反馈管理员可以访问')
}

function notificationId(scope, userId, feedbackId) {
  return crypto.createHash('sha256').update(`${scope}:${userId}:${feedbackId}`).digest('hex').slice(0, 32)
}

async function adminUsers() {
  const users = []
  for (const shareCode of configuredAdminCodes()) {
    const result = await db.collection(C.USERS).where({ shareCode }).limit(1).get()
    if (result.data[0] && !users.some(user => user._id === result.data[0]._id)) users.push(result.data[0])
  }
  return users
}

async function notifyFeedbackAdmins(feedback, submitter) {
  const admins = await adminUsers()
  const timestamp = now()
  for (const admin of admins) {
    const id = notificationId('feedback', admin._id, feedback._id)
    await db.collection(C.NOTIFICATIONS).doc(id).set({ data: {
      userId: admin._id,
      type: 'FEEDBACK_RECEIVED',
      feedbackId: feedback._id,
      title: '收到新的用户反馈',
      content: `【${feedback.categoryLabel}】${submitter.nickname || '用户'}：${feedback.content.slice(0, 120)}`,
      page: '/pages/feedback/admin',
      status: 'UNREAD',
      pushStatus: 'INTERNAL_ONLY',
      createdAt: timestamp,
      updatedAt: timestamp
    } })
  }
  return { configured: configuredAdminCodes().length > 0, notified: admins.length }
}

async function notifyFeedbackStatus(feedback, statusLabel) {
  const id = notificationId(`feedback-status-${feedback.status}`, feedback.userId, feedback._id)
  const timestamp = now()
  await db.collection(C.NOTIFICATIONS).doc(id).set({ data: {
    userId: feedback.userId,
    type: 'FEEDBACK_STATUS',
    feedbackId: feedback._id,
    title: '你的反馈有新进展',
    content: `“${feedback.content.slice(0, 60)}”已更新为：${statusLabel}`,
    page: '/pages/feedback/index',
    status: 'UNREAD',
    pushStatus: 'INTERNAL_ONLY',
    createdAt: timestamp,
    updatedAt: timestamp
  } })
}

module.exports = {
  configuredAdminCodes,
  isFeedbackAdmin,
  assertFeedbackAdmin,
  notifyFeedbackAdmins,
  notifyFeedbackStatus
}
