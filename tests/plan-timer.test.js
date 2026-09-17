const test = require('node:test')
const assert = require('node:assert/strict')
const { timerSnapshot, timerTargetMs, completedTimerFields } = require('../cloudfunctions/api/domain/plan-timer')

test('正计时会从总跨度中扣除暂停时间', () => {
  const plan = { timerMode: 'COUNT_UP' }
  const checkin = {
    timerMode: 'COUNT_UP', timerStatus: 'RUNNING',
    timerStartedAt: new Date('2026-09-17T10:00:00Z'),
    timerResumedAt: new Date('2026-09-17T10:10:00Z'),
    timerAccumulatedMs: 5 * 60 * 1000
  }
  const result = timerSnapshot(checkin, plan, new Date('2026-09-17T10:12:00Z'))
  assert.equal(result.effectiveMs, 7 * 60 * 1000)
  assert.equal(result.totalMs, 12 * 60 * 1000)
  assert.equal(result.pausedMs, 5 * 60 * 1000)
})

test('倒计时达到目标时按有效时间自动截断', () => {
  const plan = { timerMode: 'COUNT_DOWN', timerDurationMinutes: 25 }
  const checkin = {
    timerMode: 'COUNT_DOWN', timerStatus: 'RUNNING', timerTargetSeconds: 1500,
    timerStartedAt: new Date('2026-09-17T10:00:00Z'),
    timerResumedAt: new Date('2026-09-17T10:30:00Z'),
    timerAccumulatedMs: 20 * 60 * 1000
  }
  const result = timerSnapshot(checkin, plan, new Date('2026-09-17T10:40:00Z'))
  assert.equal(timerTargetMs(plan, checkin), 25 * 60 * 1000)
  assert.equal(result.reachedTarget, true)
  assert.equal(result.effectiveMs, 25 * 60 * 1000)
  assert.equal(result.totalMs, 35 * 60 * 1000)
  assert.equal(result.pausedMs, 10 * 60 * 1000)
  assert.equal(result.endedAtMs, new Date('2026-09-17T10:35:00Z').getTime())
})

test('已结束计时不随当前时间继续增长', () => {
  const result = timerSnapshot({
    timerMode: 'COUNT_UP', timerStatus: 'FINISHED',
    timerStartedAt: new Date('2026-09-17T10:00:00Z'),
    timerEndedAt: new Date('2026-09-17T10:30:00Z'),
    timerEffectiveSeconds: 1200,
    timerTotalSeconds: 1800,
    timerPausedSeconds: 600
  }, { timerMode: 'COUNT_UP' }, new Date('2026-09-18T10:00:00Z'))
  assert.equal(result.effectiveMs, 1200 * 1000)
  assert.equal(result.totalMs, 1800 * 1000)
  assert.equal(result.pausedMs, 600 * 1000)
})

test('其他记录触发计划完成时会同时结束活动计时', () => {
  const at = new Date('2026-09-17T10:30:00Z')
  const fields = completedTimerFields({
    timerMode: 'COUNT_UP', timerStatus: 'PAUSED',
    timerStartedAt: new Date('2026-09-17T10:00:00Z'),
    timerResumedAt: new Date('2026-09-17T10:00:00Z'),
    timerAccumulatedMs: 20 * 60 * 1000
  }, { timerMode: 'COUNT_UP' }, at)
  assert.equal(fields.timerStatus, 'FINISHED')
  assert.equal(fields.timerEffectiveSeconds, 1200)
  assert.equal(fields.timerTotalSeconds, 1800)
  assert.equal(fields.timerPausedSeconds, 600)
  assert.equal(fields.durationMinutes, 20)
})
