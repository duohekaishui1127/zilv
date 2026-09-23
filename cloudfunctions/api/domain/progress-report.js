const { presentDailyReview } = require('./daily-review')

function pad(value) { return String(value).padStart(2, '0') }

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dateRange(endDate, days) {
  const end = parseDate(endDate)
  if (!end || !Number.isInteger(days) || days < 1) return []
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - days + index + 1)
    return formatDate(date)
  })
}

function monthRange(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return []
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => `${year}-${pad(monthIndex + 1)}-${pad(index + 1)}`)
}

function number(value) {
  const output = Number(value || 0)
  return Number.isFinite(output) ? output : 0
}

function round1(value) { return Math.round(number(value) * 10) / 10 }

function sumByDate(items, dateField, fields) {
  return items.reduce((map, item) => {
    const date = item[dateField]
    if (!map[date]) map[date] = Object.fromEntries(fields.map(field => [field, 0]))
    fields.forEach(field => { map[date][field] += number(item[field]) })
    return map
  }, {})
}

function latestBodyByDate(records) {
  return records.reduce((map, item) => {
    const current = map[item.recordDate]
    const currentTime = current ? new Date(current.createdAt || 0).getTime() : -1
    const itemTime = new Date(item.createdAt || 0).getTime()
    if (!current || itemTime >= currentTime) map[item.recordDate] = item
    return map
  }, {})
}

function dailyReviewByDate(reviews) {
  return reviews.filter(item => item.status !== 'REVOKED').reduce((map, item) => {
    const current = map[item.date]
    const itemTime = new Date(item.updatedAt || item.checkedInAt || item.createdAt || 0).getTime()
    if (!current || itemTime >= current.time) map[item.date] = { value: item, time: itemTime }
    return map
  }, {})
}

function targetForDate(targets, date) {
  return targets.find(target => {
    const from = target.effectiveFromDate || '0000-00-00'
    const to = target.effectiveToDate || '9999-12-31'
    return from <= date && date <= to
  }) || null
}

function buildDailySeries({ dates, bodies = [], mealItems = [], workouts = [], studySessions = [], checkins = [], dailyReviews = [], notes = [], targets = [] }) {
  const bodyMap = latestBodyByDate(bodies)
  const mealMap = sumByDate(mealItems, 'recordDate', ['energyKcal', 'proteinGram'])
  const workoutMap = sumByDate(workouts, 'recordDate', ['durationMinutes', 'estimatedCalories'])
  const studyMap = sumByDate(studySessions, 'recordDate', ['durationMinutes'])
  const checkinMap = sumByDate(checkins.filter(item => item.completed), 'date', ['completed'])
  const noteCounts = notes.filter(item => item.status !== 'DELETED').reduce((map, item) => {
    map[item.recordDate] = (map[item.recordDate] || 0) + 1
    return map
  }, {})
  const reviewMap = dailyReviewByDate(dailyReviews)
  const orderedTargets = [...targets].sort((a, b) => {
    const dateOrder = String(b.effectiveFromDate || '').localeCompare(String(a.effectiveFromDate || ''))
    if (dateOrder) return dateOrder
    return new Date(b.effectiveFrom || 0).getTime() - new Date(a.effectiveFrom || 0).getTime()
  })

  return dates.map(date => {
    const body = bodyMap[date]
    const mealTracked = !!mealMap[date]
    const meal = mealMap[date] || {}
    const workout = workoutMap[date] || {}
    const study = studyMap[date] || {}
    const checkin = checkinMap[date] || {}
    const target = targetForDate(orderedTargets, date)
    const calorieIntake = round1(meal.energyKcal)
    const expenditure = target && mealTracked ? round1(number(target.baseDailyExpenditure) + number(workout.estimatedCalories)) : null
    const balance = expenditure == null ? null : round1(calorieIntake - expenditure)
    const dailyReview = presentDailyReview(reviewMap[date]?.value || null)
    const noteCount = (noteCounts[date] || 0) + (dailyReview?.note ? 1 : 0)
    const activityScore = Math.min(4,
      (mealTracked ? 1 : 0) + (number(workout.durationMinutes) > 0 ? 1 : 0) +
      (number(study.durationMinutes) > 0 ? 1 : 0) + (number(checkin.completed) > 0 ? 1 : 0) + (body ? 1 : 0) + (noteCount ? 1 : 0) + (dailyReview ? 1 : 0))
    return {
      date,
      day: Number(date.slice(-2)),
      weightKg: body?.weightKg == null ? null : number(body.weightKg),
      bodyFat: body?.bodyFat == null ? null : number(body.bodyFat),
      calorieIntake,
      mealTracked,
      proteinGram: round1(meal.proteinGram),
      targetCalories: target ? number(target.targetCalories) : null,
      proteinTarget: target ? number(target.proteinGram) : null,
      estimatedExpenditure: expenditure,
      calorieBalance: balance,
      workoutMinutes: Math.round(number(workout.durationMinutes)),
      workoutCalories: round1(workout.estimatedCalories),
      studyMinutes: Math.round(number(study.durationMinutes)),
      checkinCount: Math.round(number(checkin.completed)),
      mood: dailyReview?.mood || '',
      dailyCheckedIn: !!dailyReview,
      dailyCheckinState: dailyReview?.checkinState || '',
      allPlansCompleted: dailyReview?.allPlansCompleted || false,
      checkinMode: dailyReview?.checkinMode || '',
      noteCount,
      activityScore,
      active: activityScore > 0
    }
  })
}

function average(values) {
  const valid = values.filter(value => value != null && Number.isFinite(Number(value))).map(Number)
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null
}

function buildProgressReport(input) {
  const daily = buildDailySeries(input)
  const bodyPoints = daily.filter(day => day.weightKg != null)
  const firstWeight = bodyPoints[0]?.weightKg ?? null
  const latestWeight = bodyPoints[bodyPoints.length - 1]?.weightKg ?? null
  const balanceDays = daily.filter(day => day.calorieBalance != null)
  return {
    startDate: daily[0]?.date || null,
    endDate: daily[daily.length - 1]?.date || null,
    days: daily.length,
    daily,
    summary: {
      firstWeight,
      latestWeight,
      weightChange: firstWeight == null || latestWeight == null ? null : round1(latestWeight - firstWeight),
      averageCalorieIntake: average(daily.filter(day => day.mealTracked).map(day => day.calorieIntake)),
      calorieTrackedDays: daily.filter(day => day.mealTracked).length,
      averageCalorieBalance: average(balanceDays.map(day => day.calorieBalance)),
      proteinSuccessDays: daily.filter(day => day.mealTracked && day.proteinTarget && day.proteinGram >= day.proteinTarget).length,
      proteinTrackedDays: daily.filter(day => day.mealTracked && day.proteinTarget).length,
      workoutMinutes: daily.reduce((sum, day) => sum + day.workoutMinutes, 0),
      workoutDays: daily.filter(day => day.workoutMinutes > 0).length,
      studyMinutes: daily.reduce((sum, day) => sum + day.studyMinutes, 0),
      studyDays: daily.filter(day => day.studyMinutes > 0).length,
      checkinCount: daily.reduce((sum, day) => sum + day.checkinCount, 0),
      activeDays: daily.filter(day => day.active).length
    }
  }
}

function buildActivityCalendar(input) {
  const daily = buildDailySeries(input)
  return {
    month: daily[0]?.date.slice(0, 7) || '',
    days: daily,
    summary: {
      activeDays: daily.filter(day => day.active).length,
      checkinCount: daily.reduce((sum, day) => sum + day.checkinCount, 0),
      workoutDays: daily.filter(day => day.workoutMinutes > 0).length,
      studyDays: daily.filter(day => day.studyMinutes > 0).length,
      mealDays: daily.filter(day => day.mealTracked).length,
      noteDays: daily.filter(day => day.noteCount > 0).length
    }
  }
}

module.exports = { dateRange, monthRange, buildDailySeries, buildProgressReport, buildActivityCalendar, dailyReviewByDate }
