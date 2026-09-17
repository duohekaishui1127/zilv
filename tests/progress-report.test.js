const test = require('node:test')
const assert = require('node:assert/strict')
const { dateRange, monthRange, buildProgressReport, buildActivityCalendar, latestMoodByDate } = require('../cloudfunctions/api/domain/progress-report')

test('趋势日期范围包含结束日并正确跨月', () => {
  assert.deepEqual(dateRange('2026-03-02', 3), ['2026-02-28', '2026-03-01', '2026-03-02'])
  assert.equal(monthRange('2024-02').length, 29)
})

test('趋势报告只按有饮食记录的日期计算摄入和热量平衡', () => {
  const report = buildProgressReport({
    dates: ['2026-09-14', '2026-09-15', '2026-09-16'],
    bodies: [
      { recordDate: '2026-09-14', weightKg: 75, createdAt: new Date('2026-09-14T08:00:00Z') },
      { recordDate: '2026-09-16', weightKg: 74.4, createdAt: new Date('2026-09-16T08:00:00Z') }
    ],
    mealItems: [
      { recordDate: '2026-09-15', energyKcal: 500, proteinGram: 60 },
      { recordDate: '2026-09-15', energyKcal: 700, proteinGram: 70 }
    ],
    workouts: [{ recordDate: '2026-09-15', durationMinutes: 45, estimatedCalories: 300 }],
    studySessions: [{ recordDate: '2026-09-16', durationMinutes: 90 }],
    checkins: [{ date: '2026-09-15', completed: true }],
    targets: [{ effectiveFromDate: '2026-09-01', effectiveToDate: null, baseDailyExpenditure: 2000, proteinGram: 120 }]
  })
  assert.equal(report.summary.averageCalorieIntake, 1200)
  assert.equal(report.summary.averageCalorieBalance, -1100)
  assert.equal(report.summary.calorieTrackedDays, 1)
  assert.equal(report.summary.proteinSuccessDays, 1)
  assert.equal(report.summary.weightChange, -0.6)
  assert.equal(report.summary.activeDays, 3)
  assert.equal(report.summary.workoutMinutes, 45)
  assert.equal(report.summary.studyMinutes, 90)
})

test('活跃日历汇总饮食、运动、学习和打卡天数', () => {
  const calendar = buildActivityCalendar({
    dates: ['2026-09-01', '2026-09-02'],
    mealItems: [{ recordDate: '2026-09-01', energyKcal: 0 }],
    workouts: [{ recordDate: '2026-09-01', durationMinutes: 30 }],
    studySessions: [{ recordDate: '2026-09-02', durationMinutes: 60 }],
    checkins: [{ date: '2026-09-02', completed: true }],
    notes: [{ recordDate: '2026-09-02', status: 'ACTIVE' }]
  })
  assert.equal(calendar.summary.activeDays, 2)
  assert.equal(calendar.summary.mealDays, 1)
  assert.equal(calendar.summary.workoutDays, 1)
  assert.equal(calendar.summary.studyDays, 1)
  assert.equal(calendar.summary.checkinCount, 1)
  assert.equal(calendar.summary.noteDays, 1)
  assert.equal(calendar.days[1].noteCount, 1)
})

test('日历使用当天最后一次完成任务的心情作为印记', () => {
  const moods = latestMoodByDate([
    { date: '2026-09-17', completed: true, mood: 'GOOD', completedAt: '2026-09-17T08:00:00Z' },
    { date: '2026-09-17', completed: true, mood: 'GREAT', completedAt: '2026-09-17T10:00:00Z' },
    { date: '2026-09-18', completed: false, mood: 'BAD', completedAt: '2026-09-18T10:00:00Z' }
  ])
  assert.equal(moods['2026-09-17'].value, 'GREAT')
  assert.equal(moods['2026-09-18'], undefined)
})

test('同一天多次更新营养目标时使用最新版本', () => {
  const report = buildProgressReport({
    dates: ['2026-09-16'],
    mealItems: [{ recordDate: '2026-09-16', energyKcal: 1800, proteinGram: 100 }],
    targets: [
      { effectiveFromDate: '2026-09-16', effectiveToDate: '2026-09-16', effectiveFrom: new Date('2026-09-16T08:00:00Z'), baseDailyExpenditure: 2000, proteinGram: 120 },
      { effectiveFromDate: '2026-09-16', effectiveToDate: null, effectiveFrom: new Date('2026-09-16T10:00:00Z'), baseDailyExpenditure: 2200, proteinGram: 100 }
    ]
  })
  assert.equal(report.daily[0].estimatedExpenditure, 2200)
  assert.equal(report.summary.averageCalorieBalance, -400)
  assert.equal(report.summary.proteinSuccessDays, 1)
})
