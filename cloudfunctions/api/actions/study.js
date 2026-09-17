const { db, C } = require('../lib/db')
const { now, fail, sanitizeNumber } = require('../lib/utils')
const { studySummary } = require('../services/summaries')
const { completePlan } = require('./plans')

async function addStudySession({ user, event, localDate }) {
  const minutes = sanitizeNumber(event.durationMinutes, 1, 1440)
  if (minutes == null) throw fail('INVALID_PARAMETER', '学习时长不合法')
  let linkedPlan = null
  if (event.planId) {
    linkedPlan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
    if (!linkedPlan || linkedPlan.userId !== user._id || linkedPlan.category !== 'STUDY' || !linkedPlan.enabled || linkedPlan.deletedAt) {
      throw fail('PLAN_NOT_FOUND', '关联的学习计划不存在')
    }
  }
  const data = {
    userId: user._id, planId: event.planId || null, recordDate: localDate,
    subject: String(event.subject || '学习').slice(0, 80), content: String(event.content || '').slice(0, 500),
    durationMinutes: minutes, note: String(event.note || '').slice(0, 500), createdAt: now()
  }
  const add = await db.collection(C.STUDY).add({ data })

  let planAutoCompleted = false
  if (linkedPlan) {
    const linked = await db.collection(C.STUDY).where({ userId: user._id, planId: linkedPlan._id, recordDate: localDate }).get()
    const durationTotal = linked.data.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0)
    const shouldComplete = linkedPlan.targetType === 'BOOLEAN'
      || (linkedPlan.targetType === 'DURATION' && durationTotal >= Number(linkedPlan.targetValue || 0))
      || (linkedPlan.targetType === 'COUNT' && linked.data.length >= Number(linkedPlan.targetValue || 0))
    if (shouldComplete) {
      await completePlan({ user, event: {
        planId: linkedPlan._id,
        actualValue: linkedPlan.targetType === 'DURATION' ? durationTotal : linked.data.length,
        durationMinutes: durationTotal,
        note: data.note
      }, localDate })
      planAutoCompleted = true
    }
  }
  return { session: { _id: add._id, ...data }, summary: await studySummary(user._id, localDate), planAutoCompleted }
}

async function getDailyStudy({ user, localDate }) {
  const result = await db.collection(C.STUDY).where({ userId: user._id, recordDate: localDate }).orderBy('createdAt', 'desc').get()
  return { sessions: result.data, summary: await studySummary(user._id, localDate) }
}

module.exports = { addStudySession, getDailyStudy }
