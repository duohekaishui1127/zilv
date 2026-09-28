const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAchievements } = require('../cloudfunctions/api/domain/achievements')

function dates(startDay,count){return Array.from({length:count},(_,i)=>`2026-09-${String(startDay+i).padStart(2,'0')}`)}

test('奖章从历史数据反推获得日期和累计进度', () => {
  const reviewDates=dates(1,7)
  const result=buildAchievements({
    user:{ betaUser:true,betaStartedAt:new Date('2026-09-01T00:00:00Z'),createdAt:new Date('2026-09-01T00:00:00Z') },
    checkins:Array.from({length:100},(_,i)=>({ completed:true,date:`2026-09-${String(1 + Math.floor(i/15)).padStart(2,'0')}`,timerEffectiveSeconds:360 })),
    dailyReviews:reviewDates.map(date=>({date,status:'ACTIVE'})),
    goals:[{ goalStatus:'COMPLETED',completedAt:new Date('2026-09-06T00:00:00Z') }],
    localDate:'2026-09-28'
  })
  const byId=Object.fromEntries(result.badges.map(item=>[item.id,item]))
  assert.equal(byId.FOUNDING_TESTER.unlocked,true)
  assert.equal(byId.STREAK_7.earnedAt,'2026-09-07')
  assert.equal(byId.TASK_100.unlocked,true)
  assert.equal(byId.FIRST_GOAL.earnedAt,'2026-09-06')
})

test('中断七天后重新连续七天会获得重新出发', () => {
  const reviews=['2026-09-01','2026-09-02','2026-09-12','2026-09-13','2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18']
  const result=buildAchievements({ dailyReviews:reviews.map(date=>({date,status:'ACTIVE'})),localDate:'2026-09-20' })
  assert.equal(result.badges.find(item=>item.id==='COMEBACK').earnedAt,'2026-09-18')
})
