const test = require('node:test')
const assert = require('node:assert/strict')
const { membershipOf } = require('../cloudfunctions/api/domain/membership')
const { entitlementsOf } = require('../cloudfunctions/api/domain/entitlements')
const { legalConfig, legalAccepted, acceptanceFields } = require('../cloudfunctions/api/domain/legal')
const { proOffer } = require('../cloudfunctions/api/domain/pro-offer')

test('90 天 Beta Pro 到期后平滑回到 Free，永久 Pro 始终优先', () => {
  const beta = { betaUser:true,betaExpiresAt:'2026-10-01T00:00:00.000Z',shareCode:'ABC123' }
  assert.equal(membershipOf(beta,new Date('2026-09-30T00:00:00.000Z')).source,'BETA')
  assert.equal(membershipOf(beta,new Date('2026-10-01T00:00:00.000Z')).source,'FREE')
  assert.equal(membershipOf({ ...beta,proLifetime:true },new Date('2027-01-01T00:00:00.000Z')).source,'LIFETIME')
})

test('Free 保留核心能力，Pro 才开放完整复盘和海报', () => {
  const free = entitlementsOf({ isPro:false })
  const pro = entitlementsOf({ isPro:true })
  assert.equal(free.enabled.includes('CORE_TASKS'),true)
  assert.equal(free.reviewMonth,false)
  assert.equal(pro.reviewMonth,true)
  assert.equal(pro.reviewPoster,true)
})

test('协议接受必须匹配当前协议版本', () => {
  const fields = acceptanceFields(new Date('2026-09-28T00:00:00.000Z'))
  assert.equal(legalAccepted(fields),true)
  assert.equal(legalAccepted({ ...fields,privacyVersionAccepted:'old' }),false)
})

test('正式 Pro 购买默认关闭，仅配置商品 ID 不会误开放', () => {
  const backup = { ...process.env }
  process.env.PRO_PURCHASE_ENABLED='false'
  process.env.PRO_VIRTUAL_PRODUCT_ID='zilv_pro_lifetime'
  assert.equal(proOffer().purchaseEnabled,false)
  process.env.PRO_PURCHASE_ENABLED='true'
  assert.equal(proOffer().purchaseEnabled,true)
  process.env = backup
})

test('法律配置未填写真实运营者和联系方式时标记为未完成生产配置', () => {
  const backup = { ...process.env }
  delete process.env.LEGAL_OPERATOR_NAME
  delete process.env.LEGAL_PRIVACY_CONTACT
  const config = legalConfig()
  assert.equal(config.productionReady,false)
  process.env = backup
})
