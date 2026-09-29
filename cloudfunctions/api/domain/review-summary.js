function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0 }
function delta(current, previous) { return Math.round((number(current) - number(previous)) * 10) / 10 }

function comparison(current, previous) {
  const a = current?.summary || {}, b = previous?.summary || {}
  return {
    activeDays:delta(a.activeDays,b.activeDays), completedTasks:delta(a.completedTasks,b.completedTasks),
    focusMinutes:delta(a.focusMinutes,b.focusMinutes),
    completionRate:a.completionRate == null || b.completionRate == null || a.unknownScheduleDays || b.unknownScheduleDays ? null : delta(a.completionRate,b.completionRate),
    workoutMinutes:delta(a.workoutMinutes,b.workoutMinutes), studyMinutes:delta(a.studyMinutes,b.studyMinutes),
    averageFocusMinutes:delta(a.averageFocusMinutes,b.averageFocusMinutes),
    averageCompletedTasks:delta(number(a.completedTasks) / Math.max(1,current.days),number(b.completedTasks) / Math.max(1,previous.days))
  }
}

function highlightLines(report, completedGoals = 0) {
  const s = report?.summary || {}, lines = []
  if (s.completedTasks) lines.push(`完成 ${s.completedTasks} 次任务${s.focusMinutes ? `，累计专注 ${Math.round(s.focusMinutes / 6) / 10} 小时` : ''}。`)
  if (s.completionRate != null) lines.push(`可核实排期完成 ${s.scheduledCompletedTasks}/${s.scheduledTasks} 次，完成率 ${s.completionRate}%。`)
  if (completedGoals) lines.push(`这一段有 ${completedGoals} 个长期目标留下了归档历程。`)
  if (report.details?.stable) lines.push(`「${report.details.stable.name}」最稳定，完成 ${report.details.stable.completed}/${report.details.stable.expected} 次。`)
  if (s.longestStreak >= 2 && lines.length < 3) lines.push(`最长连续打卡 ${s.longestStreak} 天，部分完成的打卡也算记录。`)
  if (!lines.length) lines.push('记录还不多，照常执行今天的任务就好。')
  return lines.slice(0,3)
}

function posterQuote(report) {
  const s = report?.summary || {}
  if (s.longestStreak >= 30) return '坚持不必完美，但每一次回来都算数。'
  if (s.activeDays >= Math.max(5,Math.floor((report?.days || 7) * .7))) return '慢一点也没关系，我一直在向前。'
  if (s.completedTasks >= 50) return '把远方拆成今天，再把今天认真完成。'
  return '今天留下的一点点，会成为以后看得见的路。'
}

module.exports = { comparison, highlightLines, posterQuote }
