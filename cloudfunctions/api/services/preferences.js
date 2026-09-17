const DEFAULT_HOME_PREFERENCES = Object.freeze({
  showEnergy: true
})

function homePreferencesOf(user) {
  return { ...DEFAULT_HOME_PREFERENCES, showEnergy: user.homePreferences?.showEnergy !== false }
}

module.exports = { homePreferencesOf }
