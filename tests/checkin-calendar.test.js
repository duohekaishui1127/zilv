const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCheckinCalendar } = require('../cloudfunctions/api/domain/checkin-calendar')

test('打卡日历只输出计划完成进度，不携带备注和心情', () => {
  const result = buildCheckinCalendar('2026-09', [{
    _id:'plan-1', name:'学习', category:'STUDY', enabled:true, repeatType:'DAILY', startDate:'2026-09-01'
  }], [{
    _id:'checkin-1', planId:'plan-1', date:'2026-09-18', completed:true,
    note:'私人备注', mood:'开心', durationMinutes:60
  }])
  const day = result.days.find(item => item.date === '2026-09-18')
  assert.deepEqual(day.tasks, [{ planId:'plan-1', name:'学习', category:'STUDY', completed:true }])
  assert.equal(day.checkedIn, true)
  assert.equal(day.status, 'COMPLETE')
  assert.equal(result.summary.checkedInDays, 1)
})

test('群组日历只在入群日至当前日期之间显示打卡', () => {
  const plan = { _id:'plan-1', name:'学习', category:'STUDY', enabled:true, repeatType:'DAILY', startDate:'2026-09-01' }
  const result = buildCheckinCalendar('2026-09', [plan], [
    { planId:'plan-1', date:'2026-09-09', completed:true },
    { planId:'plan-1', date:'2026-09-10', completed:true },
    { planId:'plan-1', date:'2026-09-15', completed:false },
    { planId:'plan-1', date:'2026-09-21', completed:true }
  ], { startDate:'2026-09-10', endDate:'2026-09-20' })

  const beforeJoin = result.days.find(item => item.date === '2026-09-09')
  const joinDay = result.days.find(item => item.date === '2026-09-10')
  const missedDay = result.days.find(item => item.date === '2026-09-15')
  const futureDay = result.days.find(item => item.date === '2026-09-21')
  assert.deepEqual({ inRange:beforeJoin.inRange,checkedIn:beforeJoin.checkedIn,tasks:beforeJoin.tasks }, { inRange:false,checkedIn:false,tasks:[] })
  assert.equal(joinDay.checkedIn, true)
  assert.equal(missedDay.checkedIn, false)
  assert.deepEqual({ inRange:futureDay.inRange,checkedIn:futureDay.checkedIn,tasks:futureDay.tasks }, { inRange:false,checkedIn:false,tasks:[] })
  assert.equal(result.summary.checkedInDays, 1)
})

test('完成部分计划只显示进度，全部完成后才算整日打卡', () => {
  const plans = ['plan-1','plan-2'].map((id,index) => ({
    _id:id,name:`计划${index + 1}`,enabled:true,repeatType:'DAILY',startDate:'2026-09-01'
  }))
  const partial = buildCheckinCalendar('2026-09',plans,[
    { planId:'plan-1',date:'2026-09-18',completed:true }
  ])
  const partialDay=partial.days.find(item => item.date === '2026-09-18')
  assert.deepEqual({ completed:partialDay.completed,total:partialDay.total,checkedIn:partialDay.checkedIn },{
    completed:1,total:2,checkedIn:false
  })

  const complete = buildCheckinCalendar('2026-09',plans,[
    { planId:'plan-1',date:'2026-09-18',completed:true },
    { planId:'plan-2',date:'2026-09-18',completed:true }
  ])
  assert.equal(complete.days.find(item => item.date === '2026-09-18').checkedIn,true)
})
