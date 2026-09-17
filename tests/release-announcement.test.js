const test = require('node:test')
const assert = require('node:assert/strict')
const announcement = require('../cloudfunctions/api/config/release-announcement')

test('版本公告包含幂等标识和可展示文案', () => {
  assert.equal(typeof announcement.enabled, 'boolean')
  assert.ok(String(announcement.id || '').trim())
  assert.ok(String(announcement.version || '').trim())
  assert.ok(String(announcement.title || '').trim())
  assert.ok(String(announcement.content || '').trim())
})
