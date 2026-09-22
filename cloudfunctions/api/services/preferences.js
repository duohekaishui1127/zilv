const DEFAULT_HOME_PREFERENCES = Object.freeze({
  showEnergy: true,
  showLongTermGoals: true,
  cardOrder: ['LONG_TERM', 'PLANS', 'ENERGY']
})

function normalizedCardOrder(value) {
  const allowed = DEFAULT_HOME_PREFERENCES.cardOrder
  const supplied = Array.isArray(value) ? value.filter((item, index, list) => allowed.includes(item) && list.indexOf(item) === index) : []
  return [...supplied, ...allowed.filter(item => !supplied.includes(item))]
}

function homePreferencesOf(user) {
  return {
    showEnergy: user.homePreferences?.showEnergy !== false,
    showLongTermGoals: user.homePreferences?.showLongTermGoals !== false,
    cardOrder: normalizedCardOrder(user.homePreferences?.cardOrder)
  }
}

module.exports = { homePreferencesOf, normalizedCardOrder }
