const { db, C } = require('../lib/db')
const { now, fail, round1 } = require('../lib/utils')
const { timerSnapshot, secondsOf } = require('../domain/plan-timer')
const { completePlan } = require('./plans')
const { recordCountdownFinished } = require('../services/timer-notifications')
const { activeCheckins, getActiveTimer, timerContext } = require('../services/active-timers')

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
  const { plan, checkin } = await timerContext(user, event, localDate)
  if (!['COUNT_UP', 'COUNT_DOWN'].includes(plan.timerMode)) throw fail('TIMER_NOT_ENABLED', '该计划未开启计时')
  if (checkin?.completed) throw fail('PLAN_ALREADY_COMPLETED', '该计划今天已完成')
  if (checkin?.timerStatus === 'RUNNING') return timerResult(checkin, plan)
  if (checkin?.timerStatus === 'PAUSED') throw fail('TIMER_PAUSED', '计时已暂停，请继续计时')
  if (checkin?.timerStatus === 'FINISHED') throw fail('TIMER_FINISHED', '计时已结束，请完成记录')

  const active = (await activeCheckins(user._id)).find(item => item._id !== checkin?._id)
  if (active) throw fail('ACTIVE_TIMER_EXISTS', '已有任务正在计时或暂停，请先处理后再开始')

  const timestamp = now()
  const timerTargetSeconds = plan.timerMode === 'COUNT_DOWN' ? Math.round(Number(plan.timerDurationMinutes) * 60) : null
  const usesReservedCountUpReminder = plan.timerMode === 'COUNT_UP' && Boolean(user.countUpReminderPushEnabled)
  const data = {
    timerMode: plan.timerMode,
    timerStatus: 'RUNNING',
    timerTargetSeconds,
    timerReminderPushEnabled: ['COUNT_UP', 'COUNT_DOWN'].includes(plan.timerMode)
      && (event.timerReminderAuthorized === true || usesReservedCountUpReminder),
    timerRestReminderAt: null,
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
  if (usesReservedCountUpReminder) {
    await db.collection(C.USERS).doc(user._id).update({ data: { countUpReminderPushEnabled: false, updatedAt: timestamp } })
  }
  return timerResult(saved, plan, timestamp)
}

async function pausePlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await timerContext(user, event, localDate)
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
  if (snapshot.reachedTarget && plan.timerMode === 'COUNT_DOWN') {
    await recordCountdownFinished(plan, checkin, data.timerEndedAt).catch(error => console.warn('[timer-notification]', error?.message || error))
  }
  return timerResult({ ...checkin, ...data }, plan, timestamp)
}

async function resumePlanTimer({ user, event, localDate }) {
  const { plan, checkin } = await timerContext(user, event, localDate)
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
  const { plan, checkin } = await timerContext(user, event, localDate)
  if (!checkin) throw fail('TIMER_NOT_STARTED', '计时尚未开始')
  if (checkin.completed || checkin.timerStatus === 'FINISHED') {
    if (plan.timerMode === 'COUNT_UP' && event.timerReminderAuthorized === true) {
      await db.collection(C.USERS).doc(user._id).update({ data: { countUpReminderPushEnabled: true, updatedAt: now() } })
    }
    return timerResult(checkin, plan)
  }
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
  const preserveCountUpReminder = plan.timerMode === 'COUNT_UP'
    && (checkin.timerReminderPushEnabled || event.timerReminderAuthorized === true)
  await Promise.all([
    db.collection(C.CHECKINS).doc(checkin._id).update({ data }),
    preserveCountUpReminder
      ? db.collection(C.USERS).doc(user._id).update({ data: { countUpReminderPushEnabled: true, updatedAt: timestamp } })
      : Promise.resolve()
  ])
  if (snapshot.reachedTarget && plan.timerMode === 'COUNT_DOWN') {
    await recordCountdownFinished(plan, checkin, data.timerEndedAt).catch(error => console.warn('[timer-notification]', error?.message || error))
  }
  return timerResult({ ...checkin, ...data }, plan, timestamp)
}

async function finishAndCompletePlanTimer(context) {
  const timer = await finishPlanTimer(context)
  const completed = await completePlan({
    ...context,
    localDate: timer.checkin.date || context.localDate,
    event: { planId: context.event.planId }
  })
  return { ...timer, checkin:completed.checkin, dailyReview:completed.dailyReview || null, achievedGoals:completed.achievedGoals || [] }
}

module.exports = { getActiveTimer, startPlanTimer, pausePlanTimer, resumePlanTimer, finishPlanTimer, finishAndCompletePlanTimer }
