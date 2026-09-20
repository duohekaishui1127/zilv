const { daysBetween } = require('../lib/utils')

function normalizeGroupPermissions(input = {}) {
  const rawDays = Number(input.autoRemoveInactiveDays || 0)
  return {
    joinApprovalRequired: Boolean(input.joinApprovalRequired),
    autoRemoveInactiveDays: Number.isFinite(rawDays) ? Math.min(365, Math.max(0, Math.round(rawDays))) : 0,
    blockRejoinAfterAutoRemove: input.blockRejoinAfterAutoRemove !== false
  }
}

function shouldAutoRemoveMember(member, localDate, inactiveDays) {
  const threshold = Math.max(0, Number(inactiveDays || 0))
  if (!threshold || member?.role === 'OWNER' || member?.status !== 'ACTIVE') return false
  const referenceDate = member.lastGroupCheckinDate || member.joinedDate
  const inactive = daysBetween(referenceDate, localDate)
  return inactive !== null && inactive >= threshold
}

module.exports = { normalizeGroupPermissions, shouldAutoRemoveMember }
