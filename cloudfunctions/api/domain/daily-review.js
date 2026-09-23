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

function allPlansCompleted(review) {
  if (!review || review.status === 'REVOKED') return false
  if (typeof review.allPlansCompleted === 'boolean') return review.allPlansCompleted
  const total = Number(review.totalPlanCount || 0)
  const completed = Number(review.completedPlanCount || 0)
  if (total > 0) return completed >= total
  if (review.checkinMode === 'MANUAL' || review.autoCompleted === false) return false
  // Historical daily reviews were only created after every task was complete.
  return true
}

function presentDailyReview(review) {
  if (!review) return null
  const completed = allPlansCompleted(review)
  return {
    ...review,
    checkinMode: review.checkinMode || (review.autoCompleted === false ? 'MANUAL' : 'AUTO'),
    allPlansCompleted: completed,
    checkinState: completed ? 'COMPLETE' : 'INCOMPLETE'
  }
}

module.exports = { previousDate, streakFromDates, allPlansCompleted, presentDailyReview }
