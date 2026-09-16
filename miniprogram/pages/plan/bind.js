const api = require('../../utils/api')
Page({
  data: { planId:'', name:'', groups:[] },
  onLoad(options) {
    this.setData({ planId: options.planId, name: decodeURIComponent(options.name || '') })
    this.load()
  },
  async load() {
    const d = await api.call('getPlanBindings', { planId: this.data.planId })
    this.setData({ groups: d.groups })
  },
  async toggle(e) {
    const groupId = e.currentTarget.dataset.id
    const bound = !!e.currentTarget.dataset.bound
    if (bound) await api.call('unbindPlanFromGroup', { planId: this.data.planId, groupId })
    else await api.call('bindPlanToGroup', { planId: this.data.planId, groupId })
    wx.showToast({ title: bound ? '已解除绑定' : '已绑定', icon: 'success' })
    await this.load()
  }
})
