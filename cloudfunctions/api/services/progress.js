const { db, _, C } = require('../lib/db')
const { dateRange, monthRange, buildProgressReport, buildActivityCalendar } = require('../domain/progress-report')
const { attachmentsForNotes } = require('./notes')
const { presentDailyReview } = require('../domain/daily-review')
const { getTodayPlans } = require('./plans')

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
  const [rangeData, notes, dailyReviews] = await Promise.all([
    loadRangeData(userId, dates, false),
    fetchAll(C.NOTES, { userId, recordDate: _.gte(dates[0]).and(_.lte(dates[dates.length - 1])), status: 'ACTIVE' }, 'recordDate'),
    fetchAll(C.DAILY_REVIEWS, between(userId, 'date', dates[0], dates[dates.length - 1]), 'date')
  ])
  return buildActivityCalendar({ ...rangeData, notes, dailyReviews })
}

async function loadDayReview(userId, date) {
  const [checkins, notes, plans, scheduledPlans, dailyReviewResult] = await Promise.all([
    fetchAll(C.CHECKINS, { userId, date, completed: true }, 'completedAt'),
    fetchAll(C.NOTES, { userId, recordDate: date, status: 'ACTIVE' }, 'createdAt'),
    fetchAll(C.PLANS, { userId }, 'createdAt'),
    getTodayPlans(userId, date),
    db.collection(C.DAILY_REVIEWS).where({ userId, date }).limit(1).get()
  ])
  const attachmentMap = await attachmentsForNotes(notes.map(note => note._id))
  const planMap = Object.fromEntries(plans.map(plan => [plan._id, plan]))
  const presentTask = (plan, checkin) => {
    return {
      _id: checkin?._id || `plan:${plan._id}:${date}`,
      planId: plan._id,
      name: plan.name || '已完成计划',
      description: plan.description || '',
      category: plan.category || 'CUSTOM',
      executionTime: plan.executionTime || '',
      targetType: plan.targetType || 'BOOLEAN',
      targetValue: plan.targetValue,
      actualValue: checkin?.actualValue,
      unit: plan.unit || '',
      completed: !!checkin?.completed,
      durationMinutes: checkin?.durationMinutes,
      mood: checkin?.mood || '',
      note: checkin?.note || '',
      completedAt: checkin?.completedAt,
      timerMode: checkin?.timerMode || '',
      timerStatus: checkin?.timerStatus || '',
      timerEffectiveSeconds: Number(checkin?.timerEffectiveSeconds || 0),
      timerTotalSeconds: Number(checkin?.timerTotalSeconds || 0),
      timerPausedSeconds: Number(checkin?.timerPausedSeconds || 0)
    }
  }
  const tasks = scheduledPlans.map(plan => presentTask(plan, plan.checkin))
  const includedPlanIds = new Set(tasks.map(task => task.planId))
  checkins.forEach(checkin => {
    if (includedPlanIds.has(checkin.planId)) return
    tasks.push(presentTask(planMap[checkin.planId] || { _id: checkin.planId }, checkin))
    includedPlanIds.add(checkin.planId)
  })
  const completedTaskCount = tasks.filter(task => task.completed).length
  return {
    date,
    dailyReview: presentDailyReview(dailyReviewResult.data.find(item => item.status !== 'REVOKED') || null),
    taskProgress: { completed: completedTaskCount, total: tasks.length },
    tasks,
    notes: notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map(note => ({
      _id: note._id,
      type: note.type,
      title: note.title || '',
      content: note.content || '',
      tags: note.tags || [],
      attachmentCount: Number(note.attachmentCount || 0),
      attachments: (attachmentMap[note._id] || []).map(item => item.fileId),
      createdAt: note.createdAt
    }))
  }
}

module.exports = { loadProgressReport, loadActivityCalendar, loadDayReview }
