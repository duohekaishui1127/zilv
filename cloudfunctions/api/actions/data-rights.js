const { fail } = require('../lib/utils')
const { dataSummary,clearNotes,clearDiet,clearHealth,clearActivityHistory,deleteAccountData } = require('../services/data-rights')
const { legalConfig } = require('../domain/legal')

async function getDataManagementSummary({ user }) {
  return { summary:await dataSummary(user._id),contact:legalConfig().privacyContact }
}

async function deletePersonalDataCategory({ user,event }) {
  const type=String(event.type || '').toUpperCase()
  const phrase=String(event.confirmPhrase || '').trim()
  if (phrase !== '确认清空') throw fail('CONFIRMATION_REQUIRED','请输入“确认清空”后继续')
  if (type === 'NOTES') return { type,...await clearNotes(user._id) }
  if (type === 'DIET') return { type,...await clearDiet(user._id) }
  if (type === 'HEALTH') return { type,...await clearHealth(user._id) }
  if (type === 'ACTIVITY') return { type,...await clearActivityHistory(user._id) }
  throw fail('INVALID_PARAMETER','不支持的数据类型')
}

async function deleteAccount({ user,event }) {
  if (String(event.confirmPhrase || '').trim() !== '永久注销') throw fail('CONFIRMATION_REQUIRED','请输入“永久注销”后继续')
  return deleteAccountData(user)
}

module.exports = { getDataManagementSummary,deletePersonalDataCategory,deleteAccount }
