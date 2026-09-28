const { MOOD_ICONS } = require('./constants')

function calendarMoodIcon(mood, checkinState) {
  const icon = MOOD_ICONS[mood] || ''
  if (!icon || !['COMPLETE', 'INCOMPLETE'].includes(checkinState)) return icon
  return icon.replace(/\.png$/, `-${checkinState.toLowerCase()}.png`)
}

module.exports = { calendarMoodIcon }
