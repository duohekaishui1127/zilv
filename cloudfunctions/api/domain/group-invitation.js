const crypto = require('crypto')

function invitationId(groupId, recipientId, timestamp = new Date()) {
  const date = timestamp.toISOString().slice(0, 10)
  return crypto.createHash('sha256')
    .update(`group-invitation:${groupId}:${recipientId}:${date}`)
    .digest('hex').slice(0, 32)
}

module.exports = { invitationId }
