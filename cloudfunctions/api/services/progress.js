const { db, _, C } = require('../lib/db')
const { dateRange, monthRange, buildProgressReport, buildActivityCalendar } = require('../domain/progress-report')

async function fetchAll(collection, where, orderField) {
  const rows = []
  const pageSize = 100
  for (let offset = 0; offset < 1000; offset += pageSize) {
    let query = db.collection(collection).where(where)
    if (orderField) query = query.orderBy(orderField, 'asc')
    const result = await query.skip(offset).limit(pageSize).get()
    rows.push(...result.data)
    if (result.data.length < pageSize) break
  }
  return rows
}

function between(userId, field, startDate, endDate) {
  return { userId, [field]: _.gte(startDate).and(_.lte(endDate)) }
}

async function loadRangeData(userId, dates, includeTargets = true) {
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]
  const [bodies, mealItems, workouts, studySessions, checkins, targets] = await Promise.all([
    fetchAll(C.BODY, between(userId, 'recordDate', startDate, endDate), 'recordDate'),
    fetchAll(C.MEAL_ITEMS, between(userId, 'recordDate', startDate, endDate), 'recordDate'),
    fetchAll(C.WORKOUTS, between(userId, 'recordDate', startDate, endDate), 'recordDate'),
    fetchAll(C.STUDY, between(userId, 'recordDate', startDate, endDate), 'recordDate'),
    fetchAll(C.CHECKINS, between(userId, 'date', startDate, endDate), 'date'),
    includeTargets ? fetchAll(C.NUTRITION_TARGETS, { userId }) : []
  ])
  return { dates, bodies, mealItems, workouts, studySessions, checkins, targets }
}

async function loadProgressReport(userId, endDate, days) {
  const dates = dateRange(endDate, days)
  return buildProgressReport(await loadRangeData(userId, dates, true))
}

async function loadActivityCalendar(userId, month) {
  const dates = monthRange(month)
  return buildActivityCalendar(await loadRangeData(userId, dates, false))
}

module.exports = { loadProgressReport, loadActivityCalendar }
