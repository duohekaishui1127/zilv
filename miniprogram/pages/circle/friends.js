const api = require('../../utils/api')
Page({
  data: { shareCode:'', found:null, friends:[], requests:[] },
  onShow() { this.load() },
  input(e) { this.setData({ shareCode: e.detail.value.toUpperCase(), found: null }) },
  async load() {
    const [f, r] = await Promise.all([api.call('getFriends'), api.call('getFriendRequests')])
    this.setData({ friends: f.friends, requests: r.requests })
  },
  async find() {
    const code = this.data.shareCode.trim()
    if (!code) return wx.showToast({ title:'请输入好友码', icon:'none' })
    const d = await api.call('findUserByShareCode', { shareCode: code })
    this.setData({ found: d.user })
  },
  async add() {
    if (!this.data.found) return
    await api.call('sendFriendRequest', { targetUserId: this.data.found._id })
    wx.showToast({ title:'已发送', icon:'success' })
    this.setData({ found:null, shareCode:'' })
  },
  async accept(e) {
    await api.call('acceptFriendRequest', { friendshipId: e.currentTarget.dataset.id })
    await this.load()
  },
  async remove(e) {
    if (!await api.confirm('解除好友后，你们将无法继续查看彼此的好友可见状态。', '删除好友')) return
    await api.call('removeFriend', { friendUserId: e.currentTarget.dataset.id })
    wx.showToast({ title:'已删除好友', icon:'success' })
    await this.load()
  }
})
