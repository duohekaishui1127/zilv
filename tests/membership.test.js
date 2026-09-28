const test = require('node:test')
const assert = require('node:assert/strict')
const { BETA_PRO_DAYS, identityCode, betaEnrollmentFields, membershipOf } = require('../cloudfunctions/api/domain/membership')

function withEnv(changes, fn) {
  const backup = {}
  Object.keys(changes).forEach(key => { backup[key] = process.env[key]; changes[key] == null ? delete process.env[key] : process.env[key] = String(changes[key]) })
  try { return fn() } finally { Object.keys(changes).forEach(key => { backup[key] == null ? delete process.env[key] : process.env[key] = backup[key] }) }
}

test('身份码由现有好友码稳定生成，不需要新序列集合', () => {
  assert.equal(identityCode({ shareCode:'AB12CD' }), 'ZL-AB12CD')
  assert.equal(identityCode({ identityCode:'ZL-KEEP',shareCode:'NEW123' }), 'ZL-KEEP')
})

test('默认公测规则仍为90天且不会被重复延长', () => {
  assert.equal(BETA_PRO_DAYS, 90)
  withEnv({ BETA_PRO_DAYS:null }, () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const fields = betaEnrollmentFields({ shareCode:'ABC123' }, start)
    assert.equal(fields.betaGrantedDays, 90)
    assert.equal(membershipOf(fields, new Date('2026-10-30T00:00:00Z')).isPro, true)
    assert.equal(membershipOf(fields, new Date('2026-12-30T00:00:01Z')).isPro, false)
    assert.deepEqual(betaEnrollmentFields(fields, new Date('2026-11-01T00:00:00Z')), { identityCode:'ZL-ABC123' })
  })
})

test('修改新用户试用天数只影响之后领取的人，已领取用户到期时间不被重算', () => {
  const start = new Date('2026-10-01T00:00:00Z')
  const fields = withEnv({ BETA_PRO_DAYS:'30' }, () => betaEnrollmentFields({ shareCode:'TRIAL30' }, start))
  assert.equal(fields.betaGrantedDays, 30)
  assert.equal(new Date(fields.betaExpiresAt).toISOString(), '2026-10-31T00:00:00.000Z')
  withEnv({ BETA_PRO_DAYS:'14' }, () => {
    const membership = membershipOf(fields, new Date('2026-10-15T00:00:00Z'))
    assert.equal(membership.betaGrantedDays, 30)
    assert.equal(membership.configuredTrialDays, 14)
    assert.equal(new Date(membership.betaExpiresAt).toISOString(), new Date(fields.betaExpiresAt).toISOString())
  })
})
