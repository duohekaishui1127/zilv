const test = require('node:test')
const assert = require('node:assert/strict')
const { BETA_PRO_DAYS, identityCode, betaEnrollmentFields, membershipOf } = require('../cloudfunctions/api/domain/membership')

test('身份码由现有好友码稳定生成，不需要新序列集合', () => {
  assert.equal(identityCode({ shareCode:'AB12CD' }), 'ZL-AB12CD')
  assert.equal(identityCode({ identityCode:'ZL-KEEP',shareCode:'NEW123' }), 'ZL-KEEP')
})

test('公测用户自动获得90天Pro且不会被重复延长', () => {
  assert.equal(BETA_PRO_DAYS, 90)
  const start = new Date('2026-10-01T00:00:00Z')
  const fields = betaEnrollmentFields({ shareCode:'ABC123' }, start)
  assert.equal(membershipOf(fields, new Date('2026-10-30T00:00:00Z')).isPro, true)
  assert.equal(membershipOf(fields, new Date('2026-12-30T00:00:01Z')).isPro, false)
  assert.deepEqual(betaEnrollmentFields(fields, new Date('2026-11-01T00:00:00Z')), { identityCode:'ZL-ABC123' })
})
