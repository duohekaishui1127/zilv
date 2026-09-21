const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizedNickname, profileNeedsIdentity
} = require('../miniprogram/domain/profile-identity')

test('昵称会整理首尾空白并限制为30字', () => {
  assert.equal(normalizedNickname('  小明  '), '小明')
  assert.equal(normalizedNickname('一'.repeat(40)).length, 30)
})

test('默认昵称或缺少头像时提示用户完善资料', () => {
  assert.equal(profileNeedsIdentity({ nickname:'自律用户',avatar:'cloud://avatar' }), true)
  assert.equal(profileNeedsIdentity({ nickname:'小明',avatar:'' }), true)
  assert.equal(profileNeedsIdentity({ nickname:'小明',avatar:'cloud://avatar' }), false)
})
