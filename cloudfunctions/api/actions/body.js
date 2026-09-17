const { db, C } = require('../lib/db')
const { now, fail, sanitizeNumber } = require('../lib/utils')
const { getUserById } = require('../services/users')
const { recalcNutritionTarget } = require('../services/nutrition')

async function addBodyRecord({ user, event, localDate }) {
  const record = event.record || {}
  const weightKg = sanitizeNumber(record.weightKg, 20, 400)
  if (weightKg == null) throw fail('INVALID_PARAMETER', '请输入有效体重')
  const metrics = {}
  Object.entries(record.metrics || {}).forEach(([key, value]) => {
    const number = sanitizeNumber(value, 0, 500)
    if (number != null) metrics[key] = number
  })
  const data = {
    userId: user._id,
    recordDate: event.date || localDate,
    weightKg,
    bodyFat: sanitizeNumber(record.bodyFat, 0, 80),
    metrics,
    note: String(record.note || '').slice(0, 500),
    createdAt: now()
  }
  const add = await db.collection(C.BODY).add({ data })
  const nutritionTarget = await recalcNutritionTarget(await getUserById(user._id), data.recordDate)
  return { record: { _id: add._id, ...data }, nutritionTarget }
}

async function getBodyHistory({ user, event }) {
  const limit = Math.min(Math.max(Number(event.limit || 60), 1), 200)
  const result = await db.collection(C.BODY).where({ userId: user._id }).orderBy('recordDate', 'desc').limit(limit).get()
  return { records: result.data }
}

async function getBodyMetricConfig({ user }) {
  const [defs, pref] = await Promise.all([
    db.collection(C.BODY_METRICS).where({ enabled: true }).orderBy('sort', 'asc').limit(100).get(),
    db.collection(C.BODY_METRIC_PREFS).where({ userId: user._id }).limit(1).get()
  ])
  const optionalDefs = defs.data.filter(item => !['weight', 'bodyFat'].includes(item.code))
  const selectedCodes = pref.data[0]?.metricCodes || optionalDefs.filter(item => item.defaultEnabled).map(item => item.code)
  return { metrics: optionalDefs, selectedCodes }
}

async function saveBodyMetricPrefs({ user, event }) {
  const defs = await db.collection(C.BODY_METRICS).where({ enabled: true }).limit(100).get()
  const allowed = new Set(defs.data.filter(item => !['weight', 'bodyFat'].includes(item.code)).map(item => item.code))
  const metricCodes = [...new Set((Array.isArray(event.metricCodes) ? event.metricCodes : []).map(String).filter(code => allowed.has(code)))].slice(0, 30)
  const current = await db.collection(C.BODY_METRIC_PREFS).where({ userId: user._id }).limit(1).get()
  const data = { metricCodes, updatedAt: now() }
  if (current.data.length) await db.collection(C.BODY_METRIC_PREFS).doc(current.data[0]._id).update({ data })
  else await db.collection(C.BODY_METRIC_PREFS).add({ data: { userId: user._id, ...data, createdAt: now() } })
  return { metricCodes }
}

module.exports = { addBodyRecord, getBodyHistory, getBodyMetricConfig, saveBodyMetricPrefs }
