function proOffer() {
  const price = Number(process.env.PRO_LIFETIME_PRICE || 39.9)
  const enabled = String(process.env.PRO_PURCHASE_ENABLED || 'false').toLowerCase() === 'true'
  const productId = String(process.env.PRO_VIRTUAL_PRODUCT_ID || '').trim()
  return {
    purchaseEnabled: Boolean(enabled && productId),
    configured: Boolean(productId),
    channel: 'WECHAT_VIRTUAL_PAYMENT',
    productId,
    price: Number.isFinite(price) ? Math.max(0, price) : 39.9,
    currency: 'CNY',
    billing: 'LIFETIME',
    note: enabled && productId ? '永久 Pro 买断' : '购买入口尚未开放；公测期间无需付费'
  }
}

module.exports = { proOffer }
