const { fail } = require('../lib/utils')
const { TIMER_MODES, MAX_TIMER_MINUTES } = require('./plan-timer')

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
    timerMode, timerDurationMinutes: timerMode === 'COUNT_DOWN' ? Math.round(timerDurationMinutes) : null
  }
}

module.exports = { normalizePlan }
