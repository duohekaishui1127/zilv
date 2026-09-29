const STORAGE_KEY = 'zilv-private-drafts-v1'
const RETENTION = 7 * 86400000

function createDraftStore(platform,clock = () => Date.now()) {
  let pending = null, timer = null
  function read() {
    try {
      const all = pending || platform.getStorageSync(STORAGE_KEY) || {}
      return Object.fromEntries(Object.entries(all).filter(([,item]) => item && clock() - item.updatedAt < RETENTION))
    } catch (error) { return {} }
  }
  function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    try { platform.setStorageSync(STORAGE_KEY,pending) } catch (error) {}
    pending = null
  }
  function save(key,value,base) {
    if (!key) return
    pending = { ...read(),[key]:{ value,base,updatedAt:clock() } }
    pending = Object.fromEntries(Object.entries(pending).sort((a,b) => b[1].updatedAt - a[1].updatedAt).slice(0,20))
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush,400)
  }
  function get(key,base) { const item = read()[key]; return item?.base === base ? item.value : null }
  function remove(key) { pending = read(); delete pending[key]; flush() }
  function clear() { pending = {}; flush() }
  return { get,save,remove,clear,flush }
}
let instance
function store() {
  if (!instance && typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync) instance = createDraftStore(wx)
  return instance
}
module.exports = {
  createDraftStore,get:(...args) => store()?.get(...args),save:(...args) => store()?.save(...args),
  remove:(...args) => store()?.remove(...args),clear:() => store()?.clear(),flush:() => store()?.flush()
}
