const api = require('../../utils/api')

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: { feed:[], pendingFriendRequestCount:0, loading:true },
  onShow() {
    this._feedVisible = true
    this.setData({ feed: [] })
    this.load()
  },
  onHide() {
    this._feedVisible = false
    if (this._feedRefreshTimer) clearTimeout(this._feedRefreshTimer)
    this._feedRefreshTimer = null
    this.setData({ feed: [] })
  },
  scheduleFeedRefresh(milliseconds) {
    if (this._feedRefreshTimer) clearTimeout(this._feedRefreshTimer)
    if (!this._feedVisible) return
    const delay = Math.min(86400000, Math.max(1000, Number(milliseconds) || 60000))
    this._feedRefreshTimer = setTimeout(() => {
      this._feedRefreshTimer = null
      if (!this._feedVisible) return
      this.setData({ feed: [] })
      this.load()
    }, delay)
  },
  async load() {
    const requestId = (this._feedRequestId || 0) + 1
    this._feedRequestId = requestId
    this.setData({ loading:true })
    try {
      const result = await api.call('getSpecialCareFeed', {}, { silent:true })
      if (!this._feedVisible || requestId !== this._feedRequestId) return
      const pendingFriendRequestCount=Number(result.pendingFriendRequestCount || 0)
      this.setData({
        feed:(result.feed || []).map(item => ({ ...item, displayTime:displayTime(item.completedAt) })),
        pendingFriendRequestCount
      })
      if (pendingFriendRequestCount) wx.showTabBarRedDot({ index:3 })
      else wx.hideTabBarRedDot({ index:3 })
      this.scheduleFeedRefresh(result.refreshAfterMs)
    } catch (error) {
      if (this._feedVisible && requestId === this._feedRequestId) wx.showToast({ title:api.messageOf(error), icon:'none' })
    } finally {
      if (this._feedVisible && requestId === this._feedRequestId) this.setData({ loading:false })
    }
  },
  go(e){ wx.navigateTo({ url:e.currentTarget.dataset.url }) },
  openFriend(e){ wx.navigateTo({ url:`/pages/circle/friend-detail?id=${e.currentTarget.dataset.id}` }) }
})
