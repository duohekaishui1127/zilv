const test = require('node:test')
const assert = require('node:assert/strict')
const { expiredCountdownFields } = require('../cloudfunctions/reminder-dispatch/timer-rules')

test('运行中的倒计时到点后只结束计时，不自动完成任务', () => {
  const fields = expiredCountdownFields({
    timerMode: 'COUNT_DOWN',
    timerStatus: 'RUNNING',
    timerTargetSeconds: 25 * 60,
    timerStartedAt: new Date('2026-09-21T02:00:00Z'),
    timerResumedAt: new Date('2026-09-21T02:05:00Z'),
    timerAccumulatedMs: 5 * 60 * 1000,
    completed: false
  }, new Date('2026-09-21T02:25:00Z'))

  assert.equal(fields.timerStatus, 'FINISHED')
  assert.equal(fields.timerEffectiveSeconds, 25 * 60)
  assert.equal(fields.timerTotalSeconds, 25 * 60)
  assert.equal(fields.timerPausedSeconds, 0)
  assert.equal(fields.timerReminderPushEnabled, false)
  assert.equal(Object.hasOwn(fields, 'completed'), false)
  assert.equal(Object.hasOwn(fields, 'completedAt'), false)
})

test('未到点、暂停中和正计时都不会被后台结束', () => {
  const base = {
    timerMode: 'COUNT_DOWN', timerStatus: 'RUNNING', timerTargetSeconds: 1500,
    timerStartedAt: new Date('2026-09-21T02:00:00Z'),
    timerResumedAt: new Date('2026-09-21T02:00:00Z'), timerAccumulatedMs: 0
  }
  assert.equal(expiredCountdownFields(base, new Date('2026-09-21T02:24:59Z')), null)
  assert.equal(expiredCountdownFields({ ...base, timerStatus: 'PAUSED' }, new Date('2026-09-21T03:00:00Z')), null)
  assert.equal(expiredCountdownFields({ ...base, timerMode: 'COUNT_UP' }, new Date('2026-09-21T03:00:00Z')), null)
})

test('暂停后继续的倒计时会保留总用时与暂停时长', () => {
  const fields = expiredCountdownFields({
    timerMode: 'COUNT_DOWN', timerStatus: 'RUNNING', timerTargetSeconds: 1500,
    timerStartedAt: new Date('2026-09-21T02:00:00Z'),
    timerResumedAt: new Date('2026-09-21T02:10:00Z'),
    timerAccumulatedMs: 5 * 60 * 1000
  }, new Date('2026-09-21T02:30:00Z'))
  assert.equal(fields.timerEffectiveSeconds, 1500)
  assert.equal(fields.timerTotalSeconds, 1800)
  assert.equal(fields.timerPausedSeconds, 300)
  assert.equal(fields.timerEndedAt.toISOString(), '2026-09-21T02:30:00.000Z')
})
