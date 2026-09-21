const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const announcement = require('../cloudfunctions/api/config/release-announcement')
const { readReleaseManifest } = require('../tools/release-manifest')

test('VERSION 是版本号和更新公告的唯一配置源', () => {
  const manifest = readReleaseManifest(path.resolve(__dirname, '..'))
  assert.equal(announcement.id, `release-${manifest.version}`)
  assert.equal(announcement.version, manifest.version)
  assert.equal(announcement.title, manifest.title)
  assert.equal(announcement.content, manifest.content.join('\n'))
  assert.equal(announcement.enabled, manifest.enabled)
})
