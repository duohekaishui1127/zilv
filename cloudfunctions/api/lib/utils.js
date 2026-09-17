function now() { return new Date() }

function ok(data = {}, meta = {}) { return { success: true, data, ...meta } }
function fail(code, message, extra = {}) { return { success: false, code, message, ...extra } }

function sanitizeNumber(value, min = -Infinity, max = Infinity) {
  if (value === '' || value === undefined || value === null) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function dateOnly(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(fromDateStr, toDateStr = dateOnly()) {
  const from = parseDateOnly(fromDateStr)
  const to = parseDateOnly(toDateStr)
  if (!from || !to) return null
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000))
}

function weekRange(dateStr) {
  const d = parseDateOnly(dateStr) || new Date()
  const day = d.getDay() || 7
  const start = new Date(d)
  start.setDate(d.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { startDate: dateOnly(start), endDate: dateOnly(end) }
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function ageFromBirthday(birthday, at = new Date()) {
  if (!birthday) return null
  const b = new Date(`${birthday}T12:00:00`)
  if (Number.isNaN(b.getTime())) return null
  let age = at.getFullYear() - b.getFullYear()
  const md = at.getMonth() - b.getMonth()
  if (md < 0 || (md === 0 && at.getDate() < b.getDate())) age--
  return age > 0 && age < 120 ? age : null
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function round1(value) { return Math.round(Number(value || 0) * 10) / 10 }

module.exports = {
  now, ok, fail, sanitizeNumber, dateOnly, parseDateOnly, daysBetween,
  weekRange, randomCode, ageFromBirthday, escapeRegExp, round1
}
