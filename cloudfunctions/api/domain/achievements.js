const { diffDays, shiftDate } = require('./review-period')

function dateText(value) {
  if (!value) return ''
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  if (direct) return direct[0]
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function uniqueSortedDates(values) {
  return [...new Set((values || []).map(dateText).filter(Boolean))].sort()
}

function streakThresholdDate(dates, threshold) {
  let streak = 0
  let previous = ''
  for (const date of uniqueSortedDates(dates)) {
    streak = previous && diffDays(previous, date) === 1 ? streak + 1 : 1
    if (streak >= threshold) return date
    previous = date
  }
  return ''
}

function cumulativeThresholdDate(items, threshold, valueOf) {
  let total = 0
  for (const item of [...(items || [])].sort((a, b) => dateText(a.date || a.completedAt).localeCompare(dateText(b.date || b.completedAt)))) {
    total += Number(valueOf(item) || 0)
    if (total >= threshold) return dateText(item.date || item.completedAt)
  }
  return ''
}

function comebackDate(dates) {
  const list = uniqueSortedDates(dates)
  for (let i = 1; i < list.length; i++) {
    if (diffDays(list[i - 1], list[i]) < 7) continue
    const target = shiftDate(list[i], 6)
    if (list.slice(i, i + 7).length === 7 && list[i + 6] === target) return target
  }
  return ''
}

function badge(id, title, subtitle, symbol, earnedAt, progress, target, pro = false) {
  return { id, title, subtitle, symbol, earnedAt: earnedAt || '', unlocked: Boolean(earnedAt), progress: Math.min(Number(progress || 0), Number(target || 1)), target, pro }
}

function buildAchievements({ user = {}, checkins = [], dailyReviews = [], goals = [], localDate = '' }) {
  const completed = checkins.filter(item => item.completed)
    .sort((a, b) => dateText(a.date || a.completedAt).localeCompare(dateText(b.date || b.completedAt)))
  const reviews = dailyReviews.filter(item => item.status !== 'REVOKED')
  const reviewDates = uniqueSortedDates(reviews.map(item => item.date))
  const completedGoals = goals.filter(item => item.goalStatus === 'COMPLETED')
    .sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0))
  const focusSeconds = completed.reduce((sum, item) => sum + Number(item.timerEffectiveSeconds || 0), 0)
  const joined = dateText(user.betaStartedAt || user.createdAt)
  const ninetyDate = joined && localDate && diffDays(joined, localDate) >= 89 ? shiftDate(joined, 89) : ''
  const badges = [
    badge('FOUNDING_TESTER', '创始体验者', '参与早期公测', 'FT', user.betaUser ? dateText(user.betaStartedAt || user.createdAt) : '', user.betaUser ? 1 : 0, 1),
    badge('FIRST_STEP', '第一步', '第一次完成计划', '01', dateText(completed[0]?.date || completed[0]?.completedAt), completed.length, 1),
    badge('STREAK_7', '七日成行', '连续记录 7 天', '07', streakThresholdDate(reviewDates, 7), longestStreak(reviewDates), 7),
    badge('STREAK_30', '三十日同行', '连续记录 30 天', '30', streakThresholdDate(reviewDates, 30), longestStreak(reviewDates), 30, true),
    badge('TASK_100', '百项完成', '完成 100 项计划', '100', cumulativeThresholdDate(completed, 100, () => 1), completed.length, 100),
    badge('TASK_500', '五百次认真', '完成 500 项计划', '500', cumulativeThresholdDate(completed, 500, () => 1), completed.length, 500, true),
    badge('FOCUS_10H', '十小时专注', '累计专注 10 小时', '10H', cumulativeThresholdDate(completed, 10 * 3600, item => Number(item.timerEffectiveSeconds || 0)), Math.floor(focusSeconds / 60), 600),
    badge('FOCUS_100H', '百小时专注', '累计专注 100 小时', '100H', cumulativeThresholdDate(completed, 100 * 3600, item => Number(item.timerEffectiveSeconds || 0)), Math.floor(focusSeconds / 60), 6000, true),
    badge('FIRST_GOAL', '抵达一次', '完成第一个长期目标', 'GO', dateText(completedGoals[0]?.completedAt), completedGoals.length, 1),
    badge('GOAL_3', '三次抵达', '完成 3 个长期目标', '3GO', dateText(completedGoals[2]?.completedAt), completedGoals.length, 3, true),
    badge('COMEBACK', '重新出发', '中断后重新坚持 7 天', 'RE', comebackDate(reviewDates), comebackDate(reviewDates) ? 1 : 0, 1),
    badge('NINETY_DAYS', '一起走过90天', '记录属于自己的90天', '90D', ninetyDate, joined && localDate ? diffDays(joined, localDate) + 1 : 0, 90, true)
  ]
  return { badges, unlockedCount: badges.filter(item => item.unlocked).length, totalCount: badges.length }
}

function longestStreak(dates) {
  let best = 0
  let streak = 0
  let previous = ''
  for (const date of uniqueSortedDates(dates)) {
    streak = previous && diffDays(previous, date) === 1 ? streak + 1 : 1
    best = Math.max(best, streak)
    previous = date
  }
  return best
}

module.exports = { buildAchievements, longestStreak, streakThresholdDate, cumulativeThresholdDate, comebackDate }
