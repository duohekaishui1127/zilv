const test = require('node:test')
const assert = require('node:assert/strict')
const { DEFAULTS, productRules, publicProductRules } = require('../cloudfunctions/api/config/product-rules')

test('产品规则有稳定默认值，未配置环境变量时保持当前产品策略', () => {
  const rules = productRules({})
  assert.equal(rules.betaProDays, 90)
  assert.equal(rules.betaEnrollmentEnabled, true)
  assert.equal(rules.proPurchaseEnabled, false)
  assert.equal(rules.proLifetimePrice, 39.9)
  assert.deepEqual(rules.makeup.free, { cap:3, monthlyGrant:1 })
  assert.deepEqual(rules.makeup.pro, { cap:6, monthlyGrant:2 })
  assert.equal(DEFAULTS.betaProDays, 90)
})

test('开发者可通过环境变量集中修改公测与 Recovery 规则', () => {
  const rules = productRules({
    BETA_ENROLLMENT_ENABLED:'false',
    BETA_PRO_DAYS:'30',
    PRO_PURCHASE_ENABLED:'true',
    PRO_LIFETIME_PRICE:'49.9',
    MAKEUP_FREE_CARD_CAP:'4',
    MAKEUP_FREE_MONTHLY_GRANT:'2',
    MAKEUP_PRO_CARD_CAP:'8',
    MAKEUP_PRO_MONTHLY_GRANT:'3'
  })
  assert.equal(rules.betaEnrollmentEnabled, false)
  assert.equal(rules.betaProDays, 30)
  assert.equal(rules.proPurchaseEnabled, true)
  assert.equal(rules.proLifetimePrice, 49.9)
  assert.deepEqual(rules.makeup.free, { cap:4, monthlyGrant:2 })
  assert.deepEqual(rules.makeup.pro, { cap:8, monthlyGrant:3 })
  assert.deepEqual(publicProductRules({ BETA_PRO_DAYS:'30' }).beta, { enrollmentEnabled:true, trialDays:30 })
})

test('危险或异常配置会被限制在安全范围内', () => {
  const rules = productRules({
    BETA_PRO_DAYS:'9999',
    MAKEUP_FREE_CARD_CAP:'-3',
    MAKEUP_PRO_CARD_CAP:'1',
    PRO_LIFETIME_PRICE:'not-a-number'
  })
  assert.equal(rules.betaProDays, 365)
  assert.equal(rules.makeup.free.cap, 0)
  assert.equal(rules.makeup.pro.cap, 1)
  assert.equal(rules.proLifetimePrice, 39.9)
})
