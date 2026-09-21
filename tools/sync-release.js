const fs = require('fs')
const path = require('path')
const { readReleaseManifest } = require('./release-manifest')

const root = path.resolve(__dirname, '..')

function file(relativePath) { return path.join(root, relativePath) }
function read(relativePath) { return fs.readFileSync(file(relativePath), 'utf8') }
function write(relativePath, content) { fs.writeFileSync(file(relativePath), content) }

function updateJson(relativePath, update) {
  const value = JSON.parse(read(relativePath))
  update(value)
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`)
}

function replaceVersion(relativePath, pattern, replacement) {
  const source = read(relativePath)
  if (!pattern.test(source)) throw new Error(`${relativePath} 中没有找到版本字段`)
  write(relativePath, source.replace(pattern, replacement))
}

function syncPackage(relativePath, version) {
  updateJson(relativePath, value => {
    value.version = version
    if (value.packages?.['']) value.packages[''].version = version
  })
}

function announcementSource(manifest) {
  const announcement = {
    enabled: manifest.enabled,
    id: `release-${manifest.version}`,
    version: manifest.version,
    title: manifest.title,
    content: manifest.content.join('\n'),
    legacyIds: manifest.legacyAnnouncementIds
  }
  return `/**\n * 此文件由根目录 VERSION 通过 npm run release:sync 自动生成。\n * 请修改 VERSION，不要直接编辑本文件。\n */\nmodule.exports = Object.freeze(${JSON.stringify(announcement, null, 2)})\n`
}

function main() {
  const manifest = readReleaseManifest(root)
  const packageFiles = [
    'package.json', 'package-lock.json',
    'cloudfunctions/api/package.json', 'cloudfunctions/api/package-lock.json',
    'cloudfunctions/admin-init/package.json', 'cloudfunctions/admin-init/package-lock.json',
    'cloudfunctions/reminder-dispatch/package.json', 'cloudfunctions/reminder-dispatch/package-lock.json'
  ]
  packageFiles.forEach(relativePath => syncPackage(relativePath, manifest.version))
  replaceVersion('miniprogram/config/version.js', /APP_VERSION:\s*'[^']+'/, `APP_VERSION: '${manifest.version}'`)
  replaceVersion('cloudfunctions/api/lib/version.js', /APP_VERSION:\s*'[^']+'/, `APP_VERSION: '${manifest.version}'`)
  replaceVersion('cloudfunctions/admin-init/index.js', /const APP_VERSION\s*=\s*'[^']+'/, `const APP_VERSION = '${manifest.version}'`)
  write('cloudfunctions/api/config/release-announcement.js', announcementSource(manifest))
  console.log(`release synced: v${manifest.version} · ${manifest.title}`)
}

main()
