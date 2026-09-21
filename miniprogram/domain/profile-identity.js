const DEFAULT_NICKNAME = '自律用户'

function normalizedNickname(value) {
  return String(value || '').trim().slice(0, 30)
}

function profileNeedsIdentity(user = {}) {
  const nickname = normalizedNickname(user.nickname)
  return !user.avatar || !nickname || nickname === DEFAULT_NICKNAME
}

module.exports = { DEFAULT_NICKNAME, normalizedNickname, profileNeedsIdentity }
