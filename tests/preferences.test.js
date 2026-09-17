const test = require('node:test')
const assert = require('node:assert/strict')
const { homePreferencesOf } = require('../cloudfunctions/api/services/preferences')

test('今日页偏好对旧用户提供默认显示设置', () => {
  assert.deepEqual(homePreferencesOf({}), { showEnergy: true, showWeightReminder: true })
})

test('今日页偏好保留用户关闭的模块', () => {
  assert.deepEqual(
    homePreferencesOf({ homePreferences: { showEnergy: false } }),
    { showEnergy: false, showWeightReminder: true }
  )
})
