const TIMER_MODES = Object.freeze(['NONE', 'COUNT_UP', 'COUNT_DOWN'])
const TIMER_STATUSES = Object.freeze(['RUNNING', 'PAUSED', 'FINISHED'])
const MAX_TIMER_MINUTES = 1440

function dateMs(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function timerTargetMs(plan = {}, checkin = {}) {
  if ((checkin.timerMode || plan.timerMode) !== 'COUNT_DOWN') return null
  const seconds = Number(checkin.timerTargetSeconds)
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
  const minutes = Number(plan.timerDurationMinutes)
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : null
}

function timerSnapshot(checkin = {}, plan = {}, at = new Date()) {
  const status = checkin.timerStatus || ''
  const startedAtMs = dateMs(checkin.timerStartedAt)
  if (!TIMER_STATUSES.includes(status) || startedAtMs == null) {
    return { status: '', effectiveMs: 0, totalMs: 0, pausedMs: 0, reachedTarget: false, endedAtMs: null }
  }

  const atMs = dateMs(at) ?? Date.now()
  const storedEffectiveMs = Math.max(0, Number(checkin.timerAccumulatedMs || 0))
  const resumedAtMs = dateMs(checkin.timerResumedAt)
  let effectiveMs = storedEffectiveMs
  let endedAtMs = status === 'FINISHED' ? (dateMs(checkin.timerEndedAt) || atMs) : atMs

  if (status === 'RUNNING' && resumedAtMs != null) {
    effectiveMs += Math.max(0, atMs - resumedAtMs)
  }

  const targetMs = timerTargetMs(plan, checkin)
  const reachedTarget = targetMs != null && effectiveMs >= targetMs
  if (reachedTarget) {
    const overrunMs = effectiveMs - targetMs
    effectiveMs = targetMs
    if (status === 'RUNNING') endedAtMs = Math.max(startedAtMs, atMs - overrunMs)
  }

  if (status === 'FINISHED') {
    effectiveMs = Math.max(0, Number(checkin.timerEffectiveSeconds || 0) * 1000 || effectiveMs)
  }
  const totalMs = status === 'FINISHED' && Number.isFinite(Number(checkin.timerTotalSeconds))
    ? Math.max(0, Number(checkin.timerTotalSeconds) * 1000)
    : Math.max(0, endedAtMs - startedAtMs)
  const pausedMs = status === 'FINISHED' && Number.isFinite(Number(checkin.timerPausedSeconds))
    ? Math.max(0, Number(checkin.timerPausedSeconds) * 1000)
    : Math.max(0, totalMs - effectiveMs)

  return { status, effectiveMs, totalMs, pausedMs, reachedTarget, endedAtMs, targetMs }
}

function secondsOf(ms) {
  return Math.max(0, Math.round(Number(ms || 0) / 1000))
}

function completedTimerFields(checkin, plan, at = new Date()) {
  if (!['RUNNING', 'PAUSED'].includes(checkin?.timerStatus)) return {}
  const snapshot = timerSnapshot(checkin, plan, at)
  const effectiveSeconds = secondsOf(snapshot.effectiveMs)
  return {
    timerStatus: 'FINISHED',
    timerAccumulatedMs: snapshot.effectiveMs,
    timerEffectiveSeconds: effectiveSeconds,
    timerTotalSeconds: secondsOf(snapshot.totalMs),
    timerPausedSeconds: secondsOf(snapshot.pausedMs),
    timerEndedAt: new Date(snapshot.endedAtMs || at),
    timerPausedAt: null,
    durationMinutes: Math.round(effectiveSeconds / 6) / 10
  }
}

module.exports = { TIMER_MODES, TIMER_STATUSES, MAX_TIMER_MINUTES, timerTargetMs, timerSnapshot, secondsOf, completedTimerFields }
