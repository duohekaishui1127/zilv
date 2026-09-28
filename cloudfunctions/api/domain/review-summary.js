function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0 }
function delta(current, previous) { return Math.round((number(current) - number(previous)) * 10) / 10 }

function comparison(current, previous) {
  const a = current?.summary || {}
  const b = previous?.summary || {}
  return {
    activeDays: delta(a.activeDays, b.activeDays),
    completedTasks: delta(a.completedTasks, b.completedTasks),
    focusMinutes: delta(a.focusMinutes, b.focusMinutes),
    completionRate: a.completionRate == null || b.completionRate == null ? null : delta(a.completionRate, b.completionRate),
    workoutMinutes: delta(a.workoutMinutes, b.workoutMinutes),
    studyMinutes: delta(a.studyMinutes, b.studyMinutes)
  }
}

function highlightLines(report, completedGoals = 0) {
  const s = report?.summary || {}
  const lines = []
  if (s.activeDays) lines.push(`这段时间有 ${s.activeDays} 天留下了行动记录。`)
  if (s.completedTasks) lines.push(`一共完成 ${s.completedTasks} 项计划${s.focusMinutes ? `，累计专注 ${Math.round(s.focusMinutes / 6) / 10} 小时` : ''}。`)
  if (s.completionRate != null) lines.push(`有记录任务的整体完成率是 ${s.completionRate}%。`)
  if (s.longestStreak >= 2) lines.push(`最长连续记录 ${s.longestStreak} 天。`)
  if (completedGoals) lines.push(`期间完成了 ${completedGoals} 个长期目标。`)
  if (!lines.length) lines.push('这一段还很空白，但第一条记录就是以后回看时的起点。')
  return lines.slice(0, 4)
}

function posterQuote(report) {
  const s = report?.summary || {}
  if (s.longestStreak >= 30) return '坚持不必完美，但每一次回来都算数。'
  if (s.activeDays >= Math.max(5, Math.floor((report?.days || 7) * .7))) return '慢一点也没关系，我一直在向前。'
  if (s.completedTasks >= 50) return '把远方拆成今天，再把今天认真完成。'
  return '今天留下的一点点，会成为以后看得见的路。'
}

module.exports = { comparison, highlightLines, posterQuote }
