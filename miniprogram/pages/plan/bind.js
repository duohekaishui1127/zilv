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
    const result=bound
      ? await api.call('unbindPlanFromGroup',{ planId:this.data.planId,groupId })
      : await api.call('bindPlanToGroup',{ planId:this.data.planId,groupId })
    const approval=Boolean(result.approvalRequired)
    wx.showToast({ title:approval ? '解绑申请已提交' : (bound ? '已解除绑定' : '已绑定'),icon:approval ? 'none' : 'success' })
    await this.load()
  }
})
