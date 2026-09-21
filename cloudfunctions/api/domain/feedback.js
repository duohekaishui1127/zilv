function feedbackInboxForAdmin(feedbacks, adminUserId, limit = 50) {
  const size = Math.min(Math.max(Number(limit || 50), 1), 100)
  return (feedbacks || []).filter(item => item.userId !== adminUserId).slice(0, size)
}

function feedbackReplyData(feedback, adminUserId, reply, timestamp = new Date()) {
  return {
    adminReply: reply,
    repliedAt: timestamp,
    repliedBy: adminUserId,
    replyVersion: Number(feedback.replyVersion || 0) + 1,
    status: feedback.status === 'NEW' ? 'REVIEWED' : feedback.status,
    handledBy: adminUserId,
    updatedAt: timestamp
  }
}

module.exports = { feedbackInboxForAdmin, feedbackReplyData }
