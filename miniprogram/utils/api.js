function localDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function messageOf(error) {
  const raw = error && (error.message || error.errMsg)
  if (!raw) return '请求失败，请稍后重试'
  if (/timeout/i.test(raw)) return '请求超时，请检查网络后重试'
  if (/cloud function/i.test(raw) && /not found/i.test(raw)) return '云函数尚未部署，请先部署 api 云函数'
  if (error?.code === 'DATABASE_NOT_INITIALIZED') return '数据库尚未初始化，请先运行 admin-init 云函数'
  return raw
}

function diagnosticOf(error, action = '') {
  return {
    action,
    code: error?.code || 'CLIENT_ERROR',
    requestId: error?.requestId || '',
    message: error?.message || error?.errMsg || String(error || '')
  }
}

async function call(action, data = {}, options = {}) {
  const date = options.date || data.date || localDate()
  try {
    const res = await wx.cloud.callFunction({ name: 'api', data: { ...data, action, date } })
    const body = res.result || {}
    if (!body.success) {
      const err = new Error(body.message || '请求失败')
      err.code = body.code || 'UNKNOWN_ERROR'
      err.body = body
      err.requestId = body.requestId || ''
      throw err
    }
    return body.data
  } catch (error) {
    console.error('[zilu-client]', diagnosticOf(error, action))
    if (!options.silent) wx.showToast({ title: messageOf(error), icon: 'none', duration: 2200 })
    throw error
  }
}

function fileExtension(path = '') {
  const match = String(path).match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  return (match?.[1] || 'jpg').toLowerCase()
}

async function uploadImage(tempFilePath, folder = 'notes') {
  const ext = fileExtension(tempFilePath)
  const random = Math.random().toString(36).slice(2, 10)
  const cloudPath = `${folder}/${localDate()}/${Date.now()}-${random}.${ext}`
  const result = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
  return result.fileID
}

const tempFileUrlCache = new Map()

async function resolveCloudFileUrls(fileIds = []) {
  const values = fileIds.map(value => String(value || '').trim())
  const pending = [...new Set(values.filter(value => value.startsWith('cloud://') && !tempFileUrlCache.has(value)))]
  for (let offset = 0; offset < pending.length; offset += 50) {
    const batch = pending.slice(offset, offset + 50)
    try {
      const result = await wx.cloud.getTempFileURL({ fileList: batch })
      for (const item of result.fileList || []) {
        if (item.status === 0 && item.tempFileURL) tempFileUrlCache.set(item.fileID, item.tempFileURL)
      }
    } catch (error) {
      console.warn('[zilu-file-url]', error?.errMsg || error?.message || error)
    }
  }
  return values.map(value => value.startsWith('cloud://') ? (tempFileUrlCache.get(value) || '') : value)
}

async function resolveCloudFileUrl(fileId) {
  const [url] = await resolveCloudFileUrls([fileId])
  return url || ''
}

async function deleteFiles(fileIds = []) {
  const list = fileIds.filter(Boolean)
  if (!list.length) return
  try { await wx.cloud.deleteFile({ fileList: list }) } catch (error) { console.warn('[zilu-file-cleanup]', error) }
}

async function confirm(content, title = '确认') {
  const result = await wx.showModal({ title, content, confirmText: '确认', cancelText: '取消' })
  return result.confirm
}

module.exports = {
  call, localDate, messageOf, diagnosticOf,
  uploadImage, resolveCloudFileUrl, resolveCloudFileUrls, deleteFiles, confirm
}
