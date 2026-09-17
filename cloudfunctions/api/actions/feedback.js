const { db, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')
const validate = require('../lib/validators')
const {
  assertFeedbackAdmin,
  notifyFeedbackAdmins,
  notifyFeedbackStatus
} = require('../services/feedback-admin')

const CATEGORY_LABELS = Object.freeze({
  FEATURE: '功能建议',
  EXPERIENCE: '体验问题',
  BUG: '问题反馈',
  OTHER: '其他'
})
const STATUS_LABELS = Object.freeze({
  NEW: '待处理',
  REVIEWED: '已查看',
  PLANNED: '计划优化',
  COMPLETED: '已完成',
  DECLINED: '暂不处理'
})

function deviceInfoOf(value) {
  const input = value && typeof value === 'object' ? value : {}
  return {
    platform: String(input.platform || '').slice(0, 30),
    system: String(input.system || '').slice(0, 80),
    model: String(input.model || '').slice(0, 80),
    wechatVersion: String(input.wechatVersion || '').slice(0, 30),
    sdkVersion: String(input.sdkVersion || '').slice(0, 30),
    appVersion: String(input.appVersion || '').slice(0, 30)
  }
}

async function submitFeedback({ user, event, requestId }) {
  const category = validate.enumValue(event.category, Object.keys(CATEGORY_LABELS), { name: '反馈类型' })
  const content = validate.string(event.content, { name: '反馈内容', required: true, max: 2000 })
  const contact = validate.string(event.contact, { name: '联系方式', max: 100 })
  const images = validate.stringArray(event.images, { name: '截图', maxItems: 3, maxItemLength: 500 })
  const clientMutationId = validate.string(event.clientMutationId, { name: '请求标识', required: true, max: 100 })

  const existing = await db.collection(C.FEEDBACKS).where({ userId: user._id, clientMutationId }).limit(1).get()
  if (existing.data.length) {
    const saved = existing.data[0]
    if (!saved.authorNotified) {
      try {
        const receiver = await notifyFeedbackAdmins(saved, user)
        await db.collection(C.FEEDBACKS).doc(saved._id).update({ data: {
          receiverConfigured: receiver.configured,
          authorNotified: receiver.notified > 0,
          updatedAt: now()
        } })
      } catch (error) {
        console.warn('[feedback-notify]', error?.message || error)
      }
    }
    return { feedback: saved, duplicate: true }
  }

  const recent = await db.collection(C.FEEDBACKS).where({ userId: user._id }).orderBy('createdAt', 'desc').limit(10).get()
  const since = Date.now() - 24 * 60 * 60 * 1000
  if (recent.data.filter(item => new Date(item.createdAt).getTime() >= since).length >= 10) {
    throw fail('TOO_MANY_REQUESTS', '今天提交得有点多，请明天再试')
  }

  const timestamp = now()
  const data = {
    userId: user._id,
    submitterNickname: user.nickname || '自律用户',
    submitterShareCode: user.shareCode || '',
    category,
    categoryLabel: CATEGORY_LABELS[category],
    content,
    contact,
    images,
    deviceInfo: deviceInfoOf(event.deviceInfo),
    status: 'NEW',
    clientMutationId,
    requestId,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const add = await db.collection(C.FEEDBACKS).add({ data })
  const feedback = { _id: add._id, ...data }
  let receiver = { configured: false, notified: 0 }
  try {
    receiver = await notifyFeedbackAdmins(feedback, user)
  } catch (error) {
    console.warn('[feedback-notify]', error?.message || error)
  }
  await db.collection(C.FEEDBACKS).doc(feedback._id).update({ data: {
    receiverConfigured: receiver.configured,
    authorNotified: receiver.notified > 0,
    updatedAt: now()
  } })
  return { feedback: { ...feedback, receiverConfigured: receiver.configured, authorNotified: receiver.notified > 0 } }
}

async function getMyFeedbacks({ user, event }) {
  const limit = Math.min(Math.max(Number(event.limit || 30), 1), 50)
  const result = await db.collection(C.FEEDBACKS).where({ userId: user._id }).orderBy('createdAt', 'desc').limit(limit).get()
  return { feedbacks: result.data }
}

async function getFeedbackInbox({ user, event }) {
  assertFeedbackAdmin(user)
  const limit = Math.min(Math.max(Number(event.limit || 50), 1), 100)
  const result = await db.collection(C.FEEDBACKS).orderBy('createdAt', 'desc').limit(limit).get()
  return { feedbacks: result.data }
}

async function updateFeedbackStatus({ user, event }) {
  assertFeedbackAdmin(user)
  const feedbackId = validate.string(event.feedbackId, { name: '反馈标识', required: true, max: 100 })
  const status = validate.enumValue(event.status, Object.keys(STATUS_LABELS), { name: '处理状态' })
  const feedback = await db.collection(C.FEEDBACKS).doc(feedbackId).get().then(result => result.data).catch(() => null)
  if (!feedback) throw fail('NOT_FOUND', '反馈不存在')
  if (feedback.status === status) return { feedback }
  const data = { status, handledBy: user._id, updatedAt: now() }
  await db.collection(C.FEEDBACKS).doc(feedback._id).update({ data })
  const updated = { ...feedback, ...data }
  try { await notifyFeedbackStatus(updated, STATUS_LABELS[status]) } catch (error) {
    console.warn('[feedback-status-notify]', error?.message || error)
  }
  return { feedback: updated }
}

module.exports = { submitFeedback, getMyFeedbacks, getFeedbackInbox, updateFeedbackStatus }
