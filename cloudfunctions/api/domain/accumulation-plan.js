const { isBasePlanDue } = require('./plan-schedule')

const MANAGED_REPEAT_TYPES = Object.freeze(['DAILY','WEEKDAYS','WEEKENDS','SPECIFIC_WEEKDAYS','WEEKLY_COUNT'])

function dateAt(value) {
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? new Date(Date.UTC(Number(match[1]),Number(match[2]) - 1,Number(match[3]))) : null
}

function shiftDate(value,amount) {
  const date=dateAt(value)
  if(!date)return ''
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0,10)
}

function weekKey(value) {
  const date=dateAt(value)
  if(!date)return ''
  const weekday=date.getUTCDay() || 7
  return shiftDate(value,-(weekday - 1))
}

function completedCheckinsForPlan(plan,checkins) {
  return (checkins || []).filter(item => item.completed && item.planId === plan._id)
}

function remainingExecutionCount(plan,checkins,fromDate,deadlineDate) {
  if(!dateAt(fromDate) || !dateAt(deadlineDate) || deadlineDate < fromDate)return 0
  const completed=completedCheckinsForPlan(plan,checkins)
  const completedDates=new Set(completed.map(item => item.date))
  const dates=[]
  for(let date=fromDate,guard=0;date && date <= deadlineDate && guard < 4000;date=shiftDate(date,1),guard++) {
    if(isBasePlanDue(plan,date) && !completedDates.has(date))dates.push(date)
  }
  if(plan.repeatType !== 'WEEKLY_COUNT')return dates.length
  const weeklyTarget=Math.max(1,Math.round(Number(plan.repeatConfig?.weeklyCount || 1)))
  const completedByWeek=completed.reduce((map,item) => {
    const key=weekKey(item.date)
    map.set(key,(map.get(key) || 0) + 1)
    return map
  },new Map())
  const availableByWeek=dates.reduce((map,date) => {
    const key=weekKey(date)
    map.set(key,(map.get(key) || 0) + 1)
    return map
  },new Map())
  return [...availableByWeek].reduce((sum,[key,available]) =>
    sum + Math.min(available,Math.max(0,weeklyTarget - (completedByWeek.get(key) || 0))),0)
}

function roundedUp(value,unit='') {
  if(!Number.isFinite(value) || value <= 0)return 1
  const factor=/(词|个|次|页|本|道|篇|章|节|题|颗|杯|组|遍|件)/.test(String(unit)) ? 1 : 100
  return Math.ceil(value * factor) / factor
}

function recommendedTargetValue(goal,plan,checkins,localDate) {
  if(goal.unlimited)return roundedUp(Number(plan.targetValue || goal.executionTargetValue || 1),goal.unit)
  const remaining=Math.max(0,Number(goal.targetValue || 0) - Number(goal.currentValue || 0))
  if(!remaining)return roundedUp(Number(plan.targetValue || 1),goal.unit)
  if(!dateAt(goal.accumulationDeadlineDate))return roundedUp(Number(plan.targetValue || 1),goal.unit)
  const executions=remainingExecutionCount(plan,checkins,localDate,goal.accumulationDeadlineDate)
  return executions ? roundedUp(remaining / executions,goal.unit) : roundedUp(remaining,goal.unit)
}

function managedPlanOf(goal,plans) {
  return (plans || []).find(plan => plan._id === goal.managedExecutionPlanId
    || plan.managedByGoalId === goal._id) || null
}

function accumulationArchiveSnapshot(goal,plans,localDate,outcome) {
  const plan=managedPlanOf(goal,plans)
  return {
    createdDate:goal.startDate || '',completedDate:localDate,outcome,
    unlimited:Boolean(goal.unlimited),targetValue:goal.targetValue == null ? null : Number(goal.targetValue),
    accumulatedValue:Number(goal.currentValue || 0),unit:goal.unit || '',
    completedCount:Number(goal.totalCompletedCount || 0),durationMinutes:Number(goal.totalDurationMinutes || 0),
    executionPlan:plan ? {
      _id:plan._id,name:plan.name,category:plan.category || 'CUSTOM',repeatType:plan.repeatType,
      repeatConfig:plan.repeatConfig || {},targetValue:Number(plan.targetValue || 0),unit:plan.unit || ''
    } : null
  }
}

module.exports={
  MANAGED_REPEAT_TYPES,remainingExecutionCount,recommendedTargetValue,managedPlanOf,accumulationArchiveSnapshot
}
