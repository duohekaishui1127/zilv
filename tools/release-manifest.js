const fs = require('fs')
const path = require('path')

function readReleaseManifest(root) {
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'VERSION'), 'utf8')) } catch (error) {
    throw new Error(`VERSION 必须是合法 JSON：${error.message}`)
  }
  const version = String(manifest.version || '').trim()
  const title = String(manifest.title || '').trim()
  const contentItems = Array.isArray(manifest.content) ? manifest.content : [manifest.content]
  const content = contentItems.map(item => String(item || '').trim()).filter(Boolean)
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION.version 必须使用 x.y.z 格式')
  if (!title) throw new Error('VERSION.title 不能为空')
  if (!content.length) throw new Error('VERSION.content 至少需要一条更新内容')
  return {
    version,
    title,
    content,
    enabled: manifest.enabled !== false,
    legacyAnnouncementIds: [...new Set((manifest.legacyAnnouncementIds || []).map(value => String(value || '').trim()).filter(Boolean))]
  }
}

module.exports = { readReleaseManifest }
