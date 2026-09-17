const { db, _, C } = require('../lib/db')
const { now, fail, weekRange } = require('../lib/utils')
const { isBasePlanDue, assertNoActiveTimer } = require('../services/plans')
const { emitGroupEventsForCheckin } = require('../services/social')
const { syncPlanCategoryRecord } = require('../services/plan-records')
const { TIMER_MODES, MAX_TIMER_MINUTES, completedTimerFields } = require('../domain/plan-timer')
function normalizePlan(input, localDate, existing = {}) {
  const p = input || {}
  const name = String(p.name ?? existing.name ?? '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '计划名称不能为空')
  const repeatType = p.repeatType || existing.repeatType || 'DAILY'
  const targetValue = Number(p.targetValue ?? existing.targetValue ?? 1)
  if (!Number.isFinite(targetValue) || targetValue <= 0) throw fail('INVALID_PARAMETER', '目标值必须大于0')
  const repeatConfig = { ...(existing.repeatConfig || {}), ...(p.repeatConfig || {}) }
  if (repeatType === 'SPECIFIC_WEEKDAYS' && (!Array.isArray(repeatConfig.weekdays) || !repeatConfig.weekdays.length)) {
    throw fail('INVALID_PARAMETER', '请至少选择一个星期')
  }
  if (repeatType === 'WEEKLY_COUNT') {
    const legacyFallback = existing.repeatType === 'WEEKLY_COUNT' ? existing.targetValue : 1
    const weeklyCount = Number(repeatConfig.weeklyCount || legacyFallback || 1)
    if (!Number.isFinite(weeklyCount) || weeklyCount < 1 || weeklyCount > 7) throw fail('INVALID_PARAMETER', '每周次数应为1到7次')
    repeatConfig.weeklyCount = Math.round(weeklyCount)
  }
  const reminderEnabled = Boolean(p.reminderEnabled ?? existing.reminderEnabled ?? false)
  const reminderTime = String(p.reminderTime ?? existing.reminderTime ?? '21:00')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
    throw fail('INVALID_PARAMETER', '提醒时间不合法')
  }
  const timezoneOffset = Number(p.reminderTimezoneOffset ?? existing.reminderTimezoneOffset ?? 480)
  if (!Number.isFinite(timezoneOffset) || timezoneOffset < -720 || timezoneOffset > 840) {
    throw fail('INVALID_PARAMETER', '提醒时区不合法')
  }
  const timerMode = p.timerMode ?? existing.timerMode ?? 'NONE'
  if (!TIMER_MODES.includes(timerMode)) throw fail('INVALID_PARAMETER', '计时方式不合法')
  const timerDurationMinutes = timerMode === 'COUNT_DOWN'
    ? Number(p.timerDurationMinutes ?? existing.timerDurationMinutes ?? 25)
    : null
  if (timerMode === 'COUNT_DOWN' && (!Number.isFinite(timerDurationMinutes) || timerDurationMinutes < 1 || timerDurationMinutes > MAX_TIMER_MINUTES)) {
    throw fail('INVALID_PARAMETER', `倒计时时长应为1到${MAX_TIMER_MINUTES}分钟`)
  }
  return {
    name: name.slice(0, 80), category: p.category || existing.category || 'CUSTOM',
    description: String(p.description ?? existing.description ?? '').trim().slice(0, 500),
    targetType: p.targetType || existing.targetType || 'BOOLEAN', targetValue,
    unit: String(p.unit ?? existing.unit ?? '').slice(0, 20), repeatType, repeatConfig,
    startDate: p.startDate || existing.startDate || localDate,
    endDate: p.endDate === undefined ? (existing.endDate || null) : (p.endDate || null),
    privacyLevel: p.privacyLevel || existing.privacyLevel || 'FRIENDS',
    reminderEnabled,
    reminderTime,
    reminderTimezoneOffset: Math.round(timezoneOffset),
    reminderPushEnabled: reminderEnabled && Boolean(p.reminderPushEnabled ?? existing.reminderPushEnabled ?? false),
    timerMode,
    timerDurationMinutes: timerMode === 'COUNT_DOWN' ? Math.round(timerDurationMinutes) : null
  }
}

async function createPlan({ user, event, localDate }) {
  const data = { userId: user._id, ...normalizePlan(event.plan, localDate), enabled: true, createdAt: now(), updatedAt: now() }
  const add = await db.collection(C.PLANS).add({ data })
  return { plan: { _id: add._id, ...data } }
}

async function getPlan({ user, event }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  return { plan }
}

async function updatePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const data = { ...normalizePlan(event.plan, localDate, plan), updatedAt: now() }
  await db.collection(C.PLANS).doc(plan._id).update({ data })
  return { plan: { ...plan, ...data } }
}

async function setPlanEnabled({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  const enabled = !!event.enabled
  if (!enabled) await assertNoActiveTimer(user._id, plan._id, localDate)
  await db.collection(C.PLANS).doc(plan._id).update({ data: { enabled, updatedAt: now() } })
  return { enabled }
}

async function deletePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id) throw fail('PLAN_NOT_FOUND', '计划不存在')
  await assertNoActiveTimer(user._id, plan._id, localDate)
  await db.collection(C.PLANS).doc(plan._id).update({ data: { enabled: false, deletedAt: now(), updatedAt: now() } })
  const bindings = await db.collection(C.PLAN_GROUPS).where({ planId: plan._id, userId: user._id, enabled: true }).get()
  await Promise.all(bindings.data.map(b => db.collection(C.PLAN_GROUPS).doc(b._id).update({ data: { enabled: false, updatedAt: now() } })))
  return { deleted: true }
}

async function getPlans({ user }) {
  const r = await db.collection(C.PLANS).where({ userId: user._id }).orderBy('createdAt', 'desc').get()
  return { plans: r.data.filter(p => !p.deletedAt) }
}

async function completePlan({ user, event, localDate }) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!plan.enabled) throw fail('PLAN_DISABLED', '计划已停用')
  if (!isBasePlanDue(plan, localDate)) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')

  const cr = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  if (plan.repeatType === 'WEEKLY_COUNT' && !cr.data.length) {
    const { startDate, endDate } = weekRange(localDate)
    const count = await db.collection(C.CHECKINS).where({
      userId: user._id, planId: plan._id, date: _.gte(startDate).and(_.lte(endDate)), completed: true
    }).count()
    if (count.total >= Number(plan.repeatConfig?.weeklyCount || plan.targetValue || 1)) throw fail('PLAN_WEEKLY_TARGET_REACHED', '本周目标已完成')
  }

  const existingCheckin = cr.data[0] || null
  const completionTime = now()
  const finalizedTimer = completedTimerFields(existingCheckin, plan, completionTime)
  const durationMinutes = event.durationMinutes === undefined
    ? (existingCheckin?.durationMinutes ?? null)
    : (event.durationMinutes === '' || event.durationMinutes == null ? null : Number(event.durationMinutes))
  if (durationMinutes != null && (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440)) {
    throw fail('INVALID_PARAMETER', '实际用时应为0到1440分钟')
  }
  const timerDurationMinutes = finalizedTimer.durationMinutes ?? (existingCheckin?.timerStatus === 'FINISHED'
    ? roundTimerMinutes(existingCheckin.timerEffectiveSeconds)
    : durationMinutes)
  const allowedMoods = ['GREAT', 'GOOD', 'OKAY', 'TIRED', 'BAD']
  const mood = event.mood === undefined
    ? (existingCheckin?.mood || '')
    : (allowedMoods.includes(event.mood) ? event.mood : '')
  const note = event.note === undefined ? (existingCheckin?.note || '') : String(event.note || '').slice(0, 500)
  const actualValue = Number(event.actualValue ?? plan.targetValue ?? 1)
  if (!Number.isFinite(actualValue) || actualValue < 0 || actualValue > 1000000000) {
    throw fail('INVALID_PARAMETER', '实际完成量不合法')
  }
  let checkin
  const shouldEmitGroupEvent = !existingCheckin?.completed
  const data = {
    actualValue, completed: true,
    durationMinutes: timerDurationMinutes, mood, completedAt: existingCheckin?.completedAt || completionTime,
    note, ...finalizedTimer, updatedAt: completionTime
  }
  if (cr.data.length) {
    await db.collection(C.CHECKINS).doc(cr.data[0]._id).update({ data })
    checkin = { ...cr.data[0], ...data }
  } else {
    const base = { userId: user._id, planId: plan._id, date: localDate, createdAt: now(), ...data }
    const add = await db.collection(C.CHECKINS).add({ data: base })
    checkin = { _id: add._id, ...base }
  }
  await syncPlanCategoryRecord({ user, plan, checkin, localDate })
  if (shouldEmitGroupEvent) await emitGroupEventsForCheckin(user, plan, checkin)
  return { checkin }
}
function roundTimerMinutes(seconds) { const value = Number(seconds); return Number.isFinite(value) && value >= 0 ? Math.round(value / 6) / 10 : null }
module.exports = { createPlan, getPlan, updatePlan, setPlanEnabled, deletePlan, getPlans, completePlan }
