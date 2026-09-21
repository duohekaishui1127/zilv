const test = require('node:test')
const assert = require('node:assert/strict')
const { feedbackInboxForAdmin, feedbackReplyData } = require('../cloudfunctions/api/domain/feedback')

test('管理员反馈收件箱排除管理员自己提交的反馈', () => {
  const result = feedbackInboxForAdmin([
    { _id: 'a', userId: 'member-1' },
    { _id: 'b', userId: 'admin' },
    { _id: 'c', userId: 'member-2' }
  ], 'admin', 10)
  assert.deepEqual(result.map(item => item._id), ['a', 'c'])
})

test('管理员首次回复会把待处理更新为已查看并增加回复版本', () => {
  const at = new Date('2026-09-21T10:00:00Z')
  const fields = feedbackReplyData({ status: 'NEW' }, 'admin', '已收到，感谢反馈。', at)
  assert.equal(fields.status, 'REVIEWED')
  assert.equal(fields.adminReply, '已收到，感谢反馈。')
  assert.equal(fields.repliedBy, 'admin')
  assert.equal(fields.replyVersion, 1)
  assert.equal(fields.repliedAt, at)
})

test('再次回复保留当前处理状态并递增回复版本', () => {
  const fields = feedbackReplyData({ status: 'PLANNED', replyVersion: 2 }, 'admin', '已经加入计划。')
  assert.equal(fields.status, 'PLANNED')
  assert.equal(fields.replyVersion, 3)
})
