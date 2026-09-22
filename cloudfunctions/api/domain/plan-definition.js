const { fail } = require('../lib/utils')
const { TIMER_MODES, MAX_TIMER_MINUTES } = require('./plan-timer')

const PLAN_TYPES = Object.freeze({ EXECUTION: 'EXECUTION', LONG_TERM: 'LONG_TERM' })
const LONG_TERM_GOAL_TYPES = Object.freeze(['DEADLINE', 'HABIT', 'ACCUMULATION'])

function validDate(value) {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(value || ''))
}

function validTime(value) {
  return value === '' || value == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))
}

function planTypeOf(plan) {
  return plan?.planType === PLAN_TYPES.LONG_TERM ? PLAN_TYPES.LONG_TERM : PLAN_TYPES.EXECUTION
}

function isExecutionPlan(plan) { return planTypeOf(plan) === PLAN_TYPES.EXECUTION }
function isLongTermGoal(plan) { return planTypeOf(plan) === PLAN_TYPES.LONG_TERM }

function normalizePlan(input, localDate, existing = {}) {
  const p = input || {}
  const name = String(p.name ?? existing.name ?? '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '计划名称不能为空')
  const repeatType = p.repeatType || existing.repeatType || 'DAILY'
  const startDate = p.startDate || existing.startDate || localDate
  if (!validDate(startDate)) throw fail('INVALID_PARAMETER', '执行日期不合法')
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
  const executionTime = p.executionTime === undefined ? (existing.executionTime || '') : String(p.executionTime || '')
  if (!validTime(executionTime)) throw fail('INVALID_PARAMETER', '执行时间不合法')
  const timerMode = p.timerMode ?? existing.timerMode ?? 'NONE'
  if (!TIMER_MODES.includes(timerMode)) throw fail('INVALID_PARAMETER', '计时方式不合法')
  const timerDurationMinutes = timerMode === 'COUNT_DOWN'
    ? Number(p.timerDurationMinutes ?? existing.timerDurationMinutes ?? 25)
    : null
  if (timerMode === 'COUNT_DOWN' && (!Number.isFinite(timerDurationMinutes) || timerDurationMinutes < 1 || timerDurationMinutes > MAX_TIMER_MINUTES)) {
    throw fail('INVALID_PARAMETER', `倒计时时长应为1到${MAX_TIMER_MINUTES}分钟`)
  }
  return {
    planType: PLAN_TYPES.EXECUTION,
    name: name.slice(0, 80), category: p.category || existing.category || 'CUSTOM',
    description: String(p.description ?? existing.description ?? '').trim().slice(0, 500),
    targetType: p.targetType || existing.targetType || 'BOOLEAN', targetValue,
    unit: String(p.unit ?? existing.unit ?? '').slice(0, 20), repeatType, repeatConfig,
    startDate,
    endDate: repeatType === 'ONE_TIME' ? startDate : (p.endDate === undefined ? (existing.endDate || null) : (p.endDate || null)),
    executionTime,
    longTermGoalIds: Array.isArray(existing.longTermGoalIds) ? existing.longTermGoalIds.slice(0, 20) : [],
    privacyLevel: p.privacyLevel || existing.privacyLevel || 'FRIENDS',
    timerMode, timerDurationMinutes: timerMode === 'COUNT_DOWN' ? Math.round(timerDurationMinutes) : null
  }
}

function normalizeLongTermGoal(input, localDate, existing = {}) {
  const value = input || {}
  const name = String(value.name ?? existing.name ?? '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '目标名称不能为空')
  const goalType = value.goalType || existing.goalType || 'DEADLINE'
  if (!LONG_TERM_GOAL_TYPES.includes(goalType)) throw fail('INVALID_PARAMETER', '长期目标类型不合法')
  const deadlineDate = goalType === 'DEADLINE'
    ? String(value.deadlineDate ?? existing.deadlineDate ?? '')
    : null
  if (goalType === 'DEADLINE' && !validDate(deadlineDate)) throw fail('INVALID_PARAMETER', '目标日期不合法')
  const habitDays = goalType === 'HABIT' ? Math.round(Number(value.habitDays ?? existing.habitDays ?? 21)) : null
  if (goalType === 'HABIT' && (!Number.isFinite(habitDays) || habitDays < 1 || habitDays > 365)) {
    throw fail('INVALID_PARAMETER', '习惯养成天数应为1到365天')
  }
  const unlimited = goalType === 'ACCUMULATION' && Boolean(value.unlimited ?? existing.unlimited)
  const targetValue = goalType === 'ACCUMULATION' && !unlimited
    ? Number(value.targetValue ?? existing.targetValue ?? 1)
    : null
  if (goalType === 'ACCUMULATION' && !unlimited && (!Number.isFinite(targetValue) || targetValue <= 0 || targetValue > 1000000000)) {
    throw fail('INVALID_PARAMETER', '累计目标值不合法')
  }
  return {
    planType: PLAN_TYPES.LONG_TERM,
    name: name.slice(0, 80),
    description: String(value.description ?? existing.description ?? '').trim().slice(0, 300),
    goalType,
    deadlineDate,
    habitDays,
    unlimited,
    targetValue,
    unit: goalType === 'ACCUMULATION' ? String(value.unit ?? existing.unit ?? '次').trim().slice(0, 20) || '次' : '',
    goalStatus: existing.goalStatus || 'ACTIVE',
    startDate: existing.startDate || localDate,
    privacyLevel: 'PRIVATE'
  }
}

module.exports = {
  PLAN_TYPES, LONG_TERM_GOAL_TYPES,
  planTypeOf, isExecutionPlan, isLongTermGoal,
  normalizePlan, normalizeLongTermGoal
}
