const api = require('../../utils/api')

Page({
  data: {
    preferences: { showEnergy: true },
    saving: false
  },
  async onLoad() {
    const profile = await api.call('getProfile')
    this.setData({ preferences: { ...this.data.preferences, ...(profile.user.homePreferences || {}) } })
  },
  toggle(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`preferences.${key}`]: !!e.detail.value })
  },
  async save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      await api.call('updateHomePreferences', { preferences: this.data.preferences })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } finally {
      this.setData({ saving: false })
    }
  }
})
