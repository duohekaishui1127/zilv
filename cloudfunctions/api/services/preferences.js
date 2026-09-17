const DEFAULT_HOME_PREFERENCES = Object.freeze({
  showEnergy: true,
  showWeightReminder: true
})

function homePreferencesOf(user) {
  return { ...DEFAULT_HOME_PREFERENCES, ...(user.homePreferences || {}) }
}

module.exports = { homePreferencesOf }
