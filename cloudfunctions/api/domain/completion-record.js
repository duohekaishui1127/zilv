const { fail } = require('../lib/utils')
const { completedTimerFields } = require('./plan-timer')
const { completionSnapshots } = require('./execution-history')
const { isBasePlanDue } = require('./plan-schedule')

function completionRecord(plan,existing,event,timestamp,date) {
  if (!plan.enabled && !existing) throw fail('PLAN_DISABLED','计划已停用')
  if (!isBasePlanDue(plan,date) && !existing) throw fail('PLAN_NOT_DUE','该计划今天无需执行')
  const timer = completedTimerFields(existing,plan,timestamp)
  const duration = event.durationMinutes === undefined ? existing?.durationMinutes ?? null
    : event.durationMinutes === '' || event.durationMinutes == null ? null : Number(event.durationMinutes)
  if (duration != null && (!Number.isFinite(duration) || duration < 0 || duration > 1440)) throw fail('INVALID_PARAMETER','实际用时应为0到1440分钟')
  const actualValue = Number(event.actualValue ?? (existing?.completed ? existing.actualValue : null) ?? plan.targetValue ?? 1)
  if (!Number.isFinite(actualValue) || actualValue < 0 || actualValue > 1000000000) throw fail('INVALID_PARAMETER','实际完成量不合法')
  const allowedMoods = ['GREAT','GOOD','OKAY','TIRED','BAD']
  const mood = event.mood === undefined ? existing?.mood || '' : allowedMoods.includes(event.mood) ? event.mood : ''
  const firstCompletion = !existing?.completed
  return {
    ...completionSnapshots(plan,existing),actualValue,completed:true,
    durationMinutes:timer.durationMinutes ?? (existing?.timerStatus === 'FINISHED' ? Math.round(Number(existing.timerEffectiveSeconds || 0) / 6) / 10 : duration),
    mood,note:event.note === undefined ? existing?.note || '' : String(event.note || '').slice(0,500),
    completedAt:firstCompletion ? timestamp : existing.completedAt || timestamp,
    completionVersion:firstCompletion ? Number(existing?.completionVersion || 0) + 1 : Number(existing.completionVersion || 1),
    revokedAt:null,...timer,updatedAt:timestamp
  }
}

module.exports = { completionRecord }
