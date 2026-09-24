const CARD_CAP = 3
const INITIAL_CARDS = 3
const INITIAL_GRANT_VERSION = 2

function dateAtOffset(at = new Date(), offsetMinutes = 480) {
  const offset = Number.isFinite(Number(offsetMinutes)) ? Number(offsetMinutes) : 480
  return new Date(new Date(at).getTime() + offset * 60000).toISOString().slice(0, 10)
}

function todayForUser(user = {}, at = new Date()) {
  const offset = Number(user.checkinReminderTimezoneOffset ?? 480)
  return dateAtOffset(at, offset >= -720 && offset <= 840 ? offset : 480)
}

function previousDate(date) {
  const at = new Date(`${date}T12:00:00Z`)
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}

function monthIndex(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return null
  const [year, number] = month.split('-').map(Number)
  return year * 12 + number - 1
}

function makeupCardState(user = {}, today) {
  const currentMonth = String(today).slice(0, 7)
  const recordedMonth = String(user.makeupCardGrantMonth || '')
  const recordedIndex = monthIndex(recordedMonth)
  const currentIndex = monthIndex(currentMonth)
  if (recordedIndex == null || currentIndex == null) {
    return { balance: INITIAL_CARDS, grantMonth: currentMonth }
  }
  const rawBalance = Number(user.makeupCardBalance || 0)
  const legacyTopUp = Number(user.makeupCardInitialGrantVersion || 0) < INITIAL_GRANT_VERSION
    ? INITIAL_CARDS - 1 : 0
  const balance = Math.min(CARD_CAP,
    Math.max(0, Number.isFinite(rawBalance) ? Math.floor(rawBalance) : 0)
      + Math.max(0, currentIndex - recordedIndex) + legacyTopUp)
  return {
    balance,
    grantMonth: currentIndex > recordedIndex ? currentMonth : recordedMonth
  }
}

module.exports = { CARD_CAP, INITIAL_CARDS, INITIAL_GRANT_VERSION, dateAtOffset, todayForUser, previousDate, makeupCardState }
