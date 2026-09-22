const test = require('node:test')
const assert = require('node:assert/strict')
const { homePreferencesOf } = require('../cloudfunctions/api/services/preferences')

test('今日页偏好对旧用户提供默认显示设置', () => {
  assert.deepEqual(homePreferencesOf({}), {
    showEnergy: true,
    showLongTermGoals: true,
    cardOrder: ['LONG_TERM', 'PLANS', 'ENERGY']
  })
})

test('今日页偏好保留用户关闭的模块', () => {
  assert.deepEqual(
    homePreferencesOf({ homePreferences: { showEnergy: false } }),
    { showEnergy: false, showLongTermGoals: true, cardOrder: ['LONG_TERM', 'PLANS', 'ENERGY'] }
  )
})

test('今日卡片顺序会去重、过滤未知项并补全缺失项', () => {
  assert.deepEqual(homePreferencesOf({ homePreferences: {
    cardOrder: ['ENERGY', 'UNKNOWN', 'ENERGY', 'PLANS'], showLongTermGoals: false
  } }), {
    showEnergy: true,
    showLongTermGoals: false,
    cardOrder: ['ENERGY', 'PLANS', 'LONG_TERM']
  })
})
