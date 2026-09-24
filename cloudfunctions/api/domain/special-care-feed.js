const { dateAtOffset } = require('./makeup-cards')

function todayWindowForUser(user = {}, at = new Date()) {
  const configuredOffset = Number(user.checkinReminderTimezoneOffset ?? 480)
  const offset = configuredOffset >= -720 && configuredOffset <= 840 ? configuredOffset : 480
  const date = dateAtOffset(at, offset)
  const startTime = Date.parse(`${date}T00:00:00.000Z`) - offset * 60000
  return {
    date,
    start: new Date(startTime),
    end: new Date(startTime + 86400000)
  }
}

module.exports = { todayWindowForUser }
