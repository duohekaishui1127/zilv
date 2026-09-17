const api = require('../../utils/api')
Page({
  data: { id:'', group:null, members:[], events:[], isOwner:false },
  onLoad(options) { this.setData({ id: options.id }); this.load() },
  onShow() { if (this.data.id) this.load() },
  async load() {
    const d = await api.call('getGroupDetail', { groupId: this.data.id })
    this.setData({ group:d.group, members:d.members, events:d.events, isOwner:d.currentRole === 'OWNER' })
  },
  async leave() {
    if (!await api.confirm('退出后，该群绑定的计划会自动解除绑定。', '退出群组')) return
    await api.call('leaveGroup', { groupId:this.data.id })
    wx.showToast({ title:'已退出', icon:'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },
  copyCode() { wx.setClipboardData({ data:this.data.group.inviteCode }) }
})
