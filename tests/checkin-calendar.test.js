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
  assert.equal(day.status, 'COMPLETE')
})
