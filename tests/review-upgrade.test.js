const test = require('node:test')
const assert = require('node:assert/strict')
const { buildProgressReport,dateRange } = require('../cloudfunctions/api/domain/progress-report')
const { recordExecutionHistory,scheduleAt } = require('../cloudfunctions/api/domain/execution-history')
const { reportRange,previousRange,reportPeriods,reportPrompt,parseDate } = require('../cloudfunctions/api/domain/review-period')
const { comparison } = require('../cloudfunctions/api/domain/review-summary')
const { basicWeekReport } = require('../cloudfunctions/api/domain/review-details')

function plan(overrides = {}) {
  const value = { _id:'words',name:'背单词',category:'STUDY',repeatType:'DAILY',startDate:'2026-09-01',createdAt:'2026-09-01T00:00:00Z',enabled:true,...overrides }
  value.scheduleHistory = recordExecutionHistory(value,{},'2026-09-01')
  return value
}
test('漏打卡日期的已知排期进入分母，七天只完成一次是14%而不是100%', () => {
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[plan()],checkins:[{ planId:'words',date:'2026-09-21',completed:true }],dailyReviews:[{ date:'2026-09-21',totalPlanCount:1,completedPlanCount:1 }] })
  assert.equal(report.summary.completionRate,14)
  assert.equal(report.summary.scheduledTasks,7)
  assert.equal(report.summary.missedDays,6)
  assert.equal(report.summary.knownScheduleDays,7)
})
test('编辑、停用和删除之后，过去的排期和任务名不被当前设置覆盖', () => {
  const value = plan()
  value.scheduleHistory = recordExecutionHistory(value,{ name:'新任务名',repeatType:'WEEKENDS' },'2026-09-25')
  value.name = '新任务名'; value.repeatType = 'WEEKENDS'
  value.scheduleHistory = recordExecutionHistory(value,{ enabled:false,deletedAt:'2026-09-28T00:00:00Z' },'2026-09-28')
  value.deletedAt = '2026-09-28T00:00:00Z'; value.enabled = false
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[value] })
  assert.equal(report.summary.scheduledTasks,6)
  assert.equal(scheduleAt(value,'2026-09-21').plan.name,'背单词')
  assert.equal(scheduleAt(value,'2026-09-28').plan.enabled,false)
})
test('旧数据不反推编辑前的排期，缺少快照的日子保持未知', () => {
  const value = { ...plan(),scheduleHistory:[],updatedAt:'2026-09-28T00:00:00Z' }
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[value],dailyReviews:[{ date:'2026-09-21',totalPlanCount:1,completedPlanCount:1 }] })
  assert.equal(report.summary.unknownScheduleDays,6)
  assert.equal(report.summary.missedDays,0)
  assert.equal(report.summary.knownScheduleDays,1)
})
test('每周三次按完整周的三次结算，不会误算成每天一次', () => {
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[plan({ repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:3 } })],checkins:[{ planId:'words',date:'2026-09-21',completed:true },{ planId:'words',date:'2026-09-23',completed:true }] })
  assert.equal(report.summary.scheduledTasks,3)
  assert.equal(report.summary.scheduledCompletedTasks,2)
  assert.equal(report.summary.completionRate,67)
})
test('不是完整周时不假设用户漏做了剩余次数', () => {
  const report = buildProgressReport({ dates:['2026-09-21','2026-09-22'],plans:[plan({ repeatType:'WEEKLY_COUNT',repeatConfig:{ weeklyCount:3 } })],checkins:[{ planId:'words',date:'2026-09-21',completed:true }] })
  assert.equal(report.summary.completionRate,null)
  assert.equal(report.tasks[0].rate,null)
  assert.equal(report.tasks[0].completed,1)
})
test('无任务、未完成、未记录分别统计；手动打卡和补卡心情仍保留', () => {
  const report = buildProgressReport({ dates:['2026-09-25','2026-09-26'],plans:[plan({ repeatType:'WEEKENDS' })],dailyReviews:[{ date:'2026-09-25',checkinMode:'MANUAL',allPlansCompleted:false,mood:'TIRED',note:'休息' },{ date:'2026-09-26',checkinMode:'MAKEUP',allPlansCompleted:false,mood:'GOOD' }] })
  assert.equal(report.summary.noTaskDays,1)
  assert.equal(report.summary.missedDays,1)
  assert.equal(report.summary.reviewDays,2)
  assert.equal(report.details.moods.length,2)
})
test('数量积累只计历史关联的同单位任务，归档后和非关联健身记录不混入', () => {
  const goal = { _id:'vocab',name:'5000词',planType:'LONG_TERM',goalType:'ACCUMULATION',unit:'词',goalStatus:'COMPLETED',completedAt:'2026-09-25T00:00:00Z' }
  const report = buildProgressReport({ dates:dateRange('2026-09-27',7),plans:[plan(),goal],checkins:[
    { planId:'words',date:'2026-09-22',completed:true,actualValue:50,longTermGoalIdsSnapshot:['vocab'] },
    { planId:'words',date:'2026-09-26',completed:true,actualValue:60,longTermGoalIdsSnapshot:['vocab'] },
    { planId:'gym',date:'2026-09-22',completed:true,actualValue:100,longTermGoalIdsSnapshot:[] }
  ] })
  assert.equal(report.details.contributions[0].incrementValue,50)
  assert.equal(report.details.timeline[0].date,'2026-09-25')
})
test('月报对比完整自然月，跨年、二月和大小月都不遗漏日期', () => {
  const september = reportRange('MONTH','2026-10-01')
  assert.equal(previousRange(september).startDate,'2026-08-01')
  assert.equal(previousRange(september).days,31)
  assert.equal(previousRange(reportRange('MONTH','2024-03-01')).startDate,'2024-01-01')
  assert.equal(reportRange('MONTH','2027-01-01',1).startDate,'2026-11-01')
  assert.equal(parseDate('2026-02-31'),null)
})
test('历史选择受加入日期约束，Free 不收到锁定月报提示', () => {
  assert.equal(reportPeriods('MONTH','2026-10-01','2026-08-15').length,2)
  assert.equal(reportPrompt({},'2026-10-05').type,'WEEK')
  assert.equal(reportPrompt({},'2026-10-01'),null)
})
test('日均对比考虑月份天数不同，Free 概览不返回高级分析或健康明细', () => {
  const current = buildProgressReport({ dates:dateRange('2026-09-30',30),plans:[plan()] })
  const previous = buildProgressReport({ dates:dateRange('2026-08-31',31),plans:[] })
  current.summary.focusMinutes = 300; current.summary.averageFocusMinutes = 10
  previous.summary.focusMinutes = 310; previous.summary.averageFocusMinutes = 10
  assert.equal(comparison(current,previous).averageFocusMinutes,0)
  const free = basicWeekReport(current)
  assert.equal(free.daily,undefined)
  assert.equal(free.details,undefined)
  assert.equal(free.summary.latestWeight,undefined)
  assert.equal(free.summary.completedTasks,0)
})
