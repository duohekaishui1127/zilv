const { db, C } = require('../lib/db')
const { now, fail, round1 } = require('../lib/utils')
const { isBasePlanDue } = require('../services/plans')
const { timerSnapshot, secondsOf } = require('../domain/plan-timer')
const { completePlan } = require('./plans')

async function contextOf(user, event, localDate) {
  const plan = await db.collection(C.PLANS).doc(event.planId).get().then(x => x.data).catch(() => null)
  if (!plan || plan.userId !== user._id || plan.deletedAt) throw fail('PLAN_NOT_FOUND', '计划不存在')
  if (!plan.enabled) throw fail('PLAN_DISABLED', '计划已停用')
  if (!isBasePlanDue(plan, localDate)) throw fail('PLAN_NOT_DUE', '该计划今天无需执行')
  const result = await db.collection(C.CHECKINS).where({ userId: user._id, planId: plan._id, date: localDate }).limit(1).get()
  return { plan, checkin: result.data[0] || null }
}

function timerResult(checkin, plan, serverTime = now()) {
  const snapshot = timerSnapshot(checkin, plan, serverTime)
  return { checkin, snapshot: {
    status: snapshot.status,
    effectiveSeconds: secondsOf(snapshot.effectiveMs),
    totalSeconds: secondsOf(snapshot.totalMs),
    pausedSeconds: secondsOf(snapshot.pausedMs),
    reachedTarget: snapshot.reachedTarget
  }, serverTime }
}

async function startPlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await contextOf(user, event, localDate)
  if (!['COUNT_UP', 'COUNT_DOWN'].includes(plan.timerMode)) throw fail('TIMER_NOT_ENABLED', '该计划未开启计时')
  if (checkin?.completed) throw fail('PLAN_ALREADY_COMPLETED', '该计划今天已完成')
  if (checkin?.timerStatus === 'RUNNING') return timerResult(checkin, plan)
  if (checkin?.timerStatus === 'PAUSED') throw fail('TIMER_PAUSED', '计时已暂停，请继续计时')
  if (checkin?.timerStatus === 'FINISHED') throw fail('TIMER_FINISHED', '计时已结束，请完成记录')

  const today = await db.collection(C.CHECKINS).where({ userId: user._id, date: localDate }).get()
  const active = today.data.find(item => item.planId !== plan._id && ['RUNNING', 'PAUSED'].includes(item.timerStatus))
  if (active) throw fail('ACTIVE_TIMER_EXISTS', '已有其他计划正在计时或暂停，请先处理后再开始')

  const timestamp = now()
  const timerTargetSeconds = plan.timerMode === 'COUNT_DOWN' ? Math.round(Number(plan.timerDurationMinutes) * 60) : null
  const data = {
    timerMode: plan.timerMode,
    timerStatus: 'RUNNING',
    timerTargetSeconds,
    timerReminderPushEnabled: plan.timerMode === 'COUNT_DOWN' && event.timerReminderAuthorized === true,
    timerStartedAt: timestamp,
    timerResumedAt: timestamp,
    timerPausedAt: null,
    timerEndedAt: null,
    timerAccumulatedMs: 0,
    timerEffectiveSeconds: 0,
    timerTotalSeconds: 0,
    timerPausedSeconds: 0,
    updatedAt: timestamp
  }
  let saved
  if (checkin) {
    await db.collection(C.CHECKINS).doc(checkin._id).update({ data })
    saved = { ...checkin, ...data }
  } else {
    const base = { userId: user._id, planId: plan._id, date: localDate, completed: false, actualValue: 0, createdAt: timestamp, ...data }
    const added = await db.collection(C.CHECKINS).add({ data: base })
    saved = { _id: added._id, ...base }
  }
  return timerResult(saved, plan, timestamp)
}

async function pausePlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await contextOf(user, event, localDate)
  if (!checkin) throw fail('TIMER_NOT_STARTED', '计时尚未开始')
  if (checkin.completed) throw fail('PLAN_ALREADY_COMPLETED', '该计划今天已完成')
  if (checkin.timerStatus === 'PAUSED') return timerResult(checkin, plan)
  if (checkin.timerStatus !== 'RUNNING') throw fail('TIMER_NOT_RUNNING', '当前计时无法暂停')

  const timestamp = now()
  const snapshot = timerSnapshot(checkin, plan, timestamp)
  const data = {
    timerStatus: snapshot.reachedTarget ? 'FINISHED' : 'PAUSED',
    timerAccumulatedMs: snapshot.effectiveMs,
    timerEffectiveSeconds: secondsOf(snapshot.effectiveMs),
    timerTotalSeconds: secondsOf(snapshot.totalMs),
    timerPausedSeconds: secondsOf(snapshot.pausedMs),
    timerPausedAt: snapshot.reachedTarget ? null : timestamp,
    timerEndedAt: snapshot.reachedTarget ? new Date(snapshot.endedAtMs) : null,
    durationMinutes: snapshot.reachedTarget ? round1(secondsOf(snapshot.effectiveMs) / 60) : (checkin.durationMinutes ?? null),
    updatedAt: timestamp
  }
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data })
  return timerResult({ ...checkin, ...data }, plan, timestamp)
}

async function resumePlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await contextOf(user, event, localDate)
  if (!checkin) throw fail('TIMER_NOT_STARTED', '计时尚未开始')
  if (checkin.completed) throw fail('PLAN_ALREADY_COMPLETED', '该计划今天已完成')
  if (checkin.timerStatus === 'RUNNING') return timerResult(checkin, plan)
  if (checkin.timerStatus !== 'PAUSED') throw fail('TIMER_NOT_PAUSED', '当前计时无法继续')

  const timestamp = now()
  const data = { timerStatus: 'RUNNING', timerResumedAt: timestamp, timerPausedAt: null, updatedAt: timestamp }
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data })
  return timerResult({ ...checkin, ...data }, plan, timestamp)
}

async function finishPlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await contextOf(user, event, localDate)
  if (!checkin) throw fail('TIMER_NOT_STARTED', '计时尚未开始')
  if (checkin.completed || checkin.timerStatus === 'FINISHED') return timerResult(checkin, plan)
  if (!['RUNNING', 'PAUSED'].includes(checkin.timerStatus)) throw fail('TIMER_NOT_STARTED', '计时尚未开始')

  const timestamp = now()
  const snapshot = timerSnapshot(checkin, plan, timestamp)
  const effectiveSeconds = secondsOf(snapshot.effectiveMs)
  const data = {
    timerStatus: 'FINISHED',
    timerAccumulatedMs: snapshot.effectiveMs,
    timerEffectiveSeconds: effectiveSeconds,
    timerTotalSeconds: secondsOf(snapshot.totalMs),
    timerPausedSeconds: secondsOf(snapshot.pausedMs),
    timerEndedAt: new Date(snapshot.endedAtMs || timestamp),
    timerPausedAt: null,
    timerReminderPushEnabled: false,
    durationMinutes: round1(effectiveSeconds / 60),
    updatedAt: timestamp
  }
  await db.collection(C.CHECKINS).doc(checkin._id).update({ data })
  return timerResult({ ...checkin, ...data }, plan, timestamp)
}

async function finishAndCompletePlanTimer(context) {
  const timer = await finishPlanTimer(context)
  const completed = await completePlan({
    ...context,
    event: { planId: context.event.planId }
  })
  return { ...timer, checkin: completed.checkin, dailyReview: completed.dailyReview || null }
}

module.exports = { startPlanTimer, pausePlanTimer, resumePlanTimer, finishPlanTimer, finishAndCompletePlanTimer }
