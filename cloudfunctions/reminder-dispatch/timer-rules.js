function dateMs(value) {
  if (!value) return null
  const milliseconds = new Date(value).getTime()
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function expiredCountdownFields(checkin = {}, at = new Date()) {
  if (checkin.timerMode !== 'COUNT_DOWN' || checkin.timerStatus !== 'RUNNING') return null
  const targetSeconds = Number(checkin.timerTargetSeconds)
  const startedAtMs = dateMs(checkin.timerStartedAt)
  const resumedAtMs = dateMs(checkin.timerResumedAt)
  const atMs = dateMs(at)
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0 || startedAtMs == null || resumedAtMs == null || atMs == null) return null

  const accumulatedMs = Math.max(0, Number(checkin.timerAccumulatedMs || 0))
  const effectiveAtMs = accumulatedMs + Math.max(0, atMs - resumedAtMs)
  const targetMs = targetSeconds * 1000
  if (effectiveAtMs < targetMs) return null

  const endedAtMs = Math.max(startedAtMs, atMs - (effectiveAtMs - targetMs))
  const totalMs = Math.max(0, endedAtMs - startedAtMs)
  const pausedMs = Math.max(0, totalMs - targetMs)
  return {
    timerStatus: 'FINISHED',
    timerAccumulatedMs: targetMs,
    timerEffectiveSeconds: targetSeconds,
    timerTotalSeconds: Math.round(totalMs / 1000),
    timerPausedSeconds: Math.round(pausedMs / 1000),
    timerEndedAt: new Date(endedAtMs),
    timerPausedAt: null,
    timerReminderPushEnabled: false,
    durationMinutes: Math.round(targetSeconds / 6) / 10
  }
}

function countUpRestReminderDue(checkin = {}, at = new Date(), thresholdSeconds = 2.5 * 60 * 60) {
  if (checkin.timerMode !== 'COUNT_UP' || checkin.timerStatus !== 'RUNNING' || checkin.timerRestReminderAt) return false
  const resumedAtMs = dateMs(checkin.timerResumedAt)
  const atMs = dateMs(at)
  if (resumedAtMs == null || atMs == null) return false
  const accumulatedMs = Math.max(0, Number(checkin.timerAccumulatedMs || 0))
  const effectiveMs = accumulatedMs + Math.max(0, atMs - resumedAtMs)
  return effectiveMs >= Number(thresholdSeconds) * 1000
}

function pendingTimerReminderValid(notification = {}, checkin = {}) {
  if (!checkin || checkin.completed) return false
  if (notification.type === 'TIMER_REST_REMINDER') {
    return checkin.timerMode === 'COUNT_UP' && Boolean(checkin.timerRestReminderAt)
  }
  return notification.type === 'TIMER_REMINDER' && checkin.timerStatus === 'FINISHED'
}

module.exports = { expiredCountdownFields, countUpRestReminderDue, pendingTimerReminderValid }
