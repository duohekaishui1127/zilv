const { createRequestCache } = require('./request-cache')
const drafts = require('./drafts')
const requestCache = createRequestCache()
let serverClockOffset = null, timezoneOffset = 480

function localDate(date) {
  if (date == null && serverClockOffset != null) return new Date(Date.now() + serverClockOffset + timezoneOffset * 60000).toISOString().slice(0,10)
  const value = date || new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
}
function rememberClock(body) {
  const at = new Date(body.serverTime || '').getTime()
  if (Number.isFinite(at)) serverClockOffset = at - Date.now()
  if (Number.isFinite(body.timezoneOffset)) timezoneOffset = body.timezoneOffset
}
function messageOf(error) {
  const raw = error && (error.message || error.errMsg)
  if (!raw) return '请求失败，请稍后重试'
  if (/timeout/i.test(raw)) return '请求超时，请检查网络后重试'
  if (/cloud function/i.test(raw) && /not found/i.test(raw)) return '服务暂时不可用，请稍后重试'
  if (error?.code === 'DATABASE_NOT_INITIALIZED') return '服务正在准备中，请稍后重试'
  if (error?.code === 'DAY_CHANGED') return '日期已更新，请刷新后重试'
  return raw
}
function diagnosticOf(error,action = '') {
  return { action,code:error?.code || 'CLIENT_ERROR',requestId:error?.requestId || '',message:error?.message || error?.errMsg || String(error || '') }
}
async function call(action,data = {},options = {}) {
  const payload = { ...data,action,date:options.date || data.date || localDate() }
  try {
    const value = await requestCache.run(action,payload,async () => {
      const res = await wx.cloud.callFunction({ name:'api',data:payload })
      const body = res.result || {}
      rememberClock(body)
      if (!body.success) {
        const error = new Error(body.message || '请求失败')
        Object.assign(error,{ code:body.code || 'UNKNOWN_ERROR',body,requestId:body.requestId || '' })
        throw error
      }
      if (action === 'deleteAccount') { drafts.clear(); tempFileUrlCache.clear() }
      return body.data
    },options)
    if (value?.serverTime && serverClockOffset != null) value.serverTime = new Date(Date.now() + serverClockOffset).toISOString()
    return value
  } catch (error) {
    if (['LEGAL_CONSENT_REQUIRED','UNAUTHORIZED','DAY_CHANGED'].includes(error?.code)) requestCache.clear()
    console.error('[zilu-client]',diagnosticOf(error,action))
    if (error?.code === 'LEGAL_CONSENT_REQUIRED' && !['getLegalGate','acceptLegal'].includes(action)) {
      const pages = getCurrentPages(), route = pages.length ? pages[pages.length - 1].route : ''
      if (!route.startsWith('pages/legal/')) setTimeout(() => wx.reLaunch({ url:'/pages/legal/consent' }),0)
    } else if (!options.silent) wx.showToast({ title:messageOf(error),icon:'none',duration:2200 })
    throw error
  }
}
function fileExtension(path = '') { return (String(path).match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg').toLowerCase() }
async function uploadImage(tempFilePath,folder = 'notes') {
  const ext = fileExtension(tempFilePath), random = Math.random().toString(36).slice(2,10)
  const cloudPath = `${folder}/${localDate()}/${Date.now()}-${random}.${ext}`
  return (await wx.cloud.uploadFile({ cloudPath,filePath:tempFilePath })).fileID
}
const tempFileUrlCache = new Map()
async function resolveCloudFileUrls(fileIds = []) {
  const values = fileIds.map(value => String(value || '').trim())
  for (const [key,item] of tempFileUrlCache) if (item.expires <= Date.now()) tempFileUrlCache.delete(key)
  const pending = [...new Set(values.filter(value => value.startsWith('cloud://') && !tempFileUrlCache.has(value)))]
  const fresh = new Map()
  for (let offset = 0; offset < pending.length; offset += 50) {
    try {
      const result = await wx.cloud.getTempFileURL({ fileList:pending.slice(offset,offset + 50) })
      for (const item of result.fileList || []) {
        if (item.status !== 0 || !item.tempFileURL) continue
        fresh.set(item.fileID,item.tempFileURL)
        if (tempFileUrlCache.size >= 200) tempFileUrlCache.delete(tempFileUrlCache.keys().next().value)
        tempFileUrlCache.set(item.fileID,{ url:item.tempFileURL,expires:Date.now() + 30 * 60000 })
      }
    } catch (error) { console.warn('[zilu-file-url]',error?.errMsg || error?.message || error) }
  }
  return values.map(value => value.startsWith('cloud://') ? fresh.get(value) || tempFileUrlCache.get(value)?.url || '' : value)
}
async function resolveCloudFileUrl(fileId) { return (await resolveCloudFileUrls([fileId]))[0] || '' }
async function deleteFiles(fileIds = []) {
  const list = fileIds.filter(Boolean)
  if (!list.length) return
  try { await wx.cloud.deleteFile({ fileList:list }) } catch (error) { console.warn('[zilu-file-cleanup]',error) }
}
async function confirm(content,title = '确认') {
  return (await wx.showModal({ title,content,confirmText:'确认',cancelText:'取消' })).confirm
}
module.exports = { call,localDate,messageOf,diagnosticOf,clearCache:() => requestCache.clear(),uploadImage,resolveCloudFileUrl,resolveCloudFileUrls,deleteFiles,confirm }
