function pct(value, target) {
  const v = Number(value || 0)
  const t = Number(target || 0)
  if (!t) return 0
  return Math.max(0, Math.min(100, Math.round(v / t * 100)))
}

function num(value, digits = 0) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(digits) : Number(0).toFixed(digits)
}

function energyState(balance) {
  const value = Number(balance || 0)
  return {
    balance: Math.round(value),
    deficit: value < 0 ? Math.abs(Math.round(value)) : 0,
    surplus: value > 0 ? Math.round(value) : 0,
    isDeficit: value < 0,
    isSurplus: value > 0
  }
}

module.exports = { pct, num, energyState }
