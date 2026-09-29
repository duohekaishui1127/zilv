const { productRules } = require('../config/product-rules')

function proOffer() {
  const rules = productRules()
  const productId = String(process.env.PRO_VIRTUAL_PRODUCT_ID || '').trim()
  return {
    purchaseEnabled: Boolean(rules.proPurchaseEnabled && productId),
    paymentReady: false,
    configured: Boolean(productId),
    channel: 'WECHAT_VIRTUAL_PAYMENT',
    productId,
    price: rules.proLifetimePrice,
    currency: 'CNY',
    billing: 'LIFETIME',
    note: '购买入口尚未开放；公测期间无需付费'
  }
}

module.exports = { proOffer }
