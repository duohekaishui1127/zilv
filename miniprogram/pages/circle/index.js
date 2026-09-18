const api = require('../../utils/api')

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: { feed:[], loading:true },
  onShow() { this.load() },
  async load() {
    this.setData({ loading:true })
    try {
      const result = await api.call('getSpecialCareFeed', {}, { silent:true })
      this.setData({ feed:(result.feed || []).map(item => ({ ...item, displayTime:displayTime(item.completedAt) })) })
    } catch (error) {
      wx.showToast({ title:api.messageOf(error), icon:'none' })
    } finally {
      this.setData({ loading:false })
    }
  },
  go(e){ wx.navigateTo({ url:e.currentTarget.dataset.url }) }
})
