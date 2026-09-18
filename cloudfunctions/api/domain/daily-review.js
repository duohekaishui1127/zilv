function previousDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() - 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function streakFromDates(dates, endDate) {
  const completedDates = new Set((dates || []).map(String))
  let expected = endDate
  let streak = 0
  while (completedDates.has(expected)) {
    streak++
    expected = previousDate(expected)
  }
  return streak
}

module.exports = { previousDate, streakFromDates }
