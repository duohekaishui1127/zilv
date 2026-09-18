const api = require('../../utils/api')
Page({
  data: { shareCode:'', found:null, friends:[], requests:[], notificationConfig:null },
  onShow() { this.load() },
  input(e) { this.setData({ shareCode: e.detail.value.toUpperCase(), found: null }) },
  async load() {
    const [f, r, config] = await Promise.all([
      api.call('getFriends'), api.call('getFriendRequests'),
      api.call('getSocialNotificationConfig', {}, { silent:true })
    ])
    this.setData({ friends: f.friends, requests: r.requests, notificationConfig:config })
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
  async specialChange(e) {
    const targetUserId = e.currentTarget.dataset.id
    await api.call('setSpecialCare', { targetUserId, enabled:e.detail.value })
    await this.load()
  },
  async specialWechatChange(e) {
    const targetUserId = e.currentTarget.dataset.id
    if (!e.detail.value) {
      await api.call('setSpecialCareWechat', { targetUserId, enabled:false })
      return this.load()
    }
    const config = this.data.notificationConfig
    if (!config?.configured) {
      wx.showToast({ title:'微信提醒模板尚未配置', icon:'none' })
      return this.load()
    }
    try {
      const result = await wx.requestSubscribeMessage({ tmplIds:[config.templateId] })
      const accepted = result[config.templateId] === 'accept'
      await api.call('setSpecialCareWechat', { targetUserId, enabled:accepted, grantAccepted:accepted })
      wx.showToast({ title:accepted ? '已订阅下次提醒' : '未开启提醒', icon:'none' })
    } catch (error) {
      wx.showToast({ title:'未开启提醒', icon:'none' })
    }
    await this.load()
  },
  async remove(e) {
    if (!await api.confirm('解除好友后，你们将无法继续查看彼此的好友可见状态。', '删除好友')) return
    await api.call('removeFriend', { friendUserId: e.currentTarget.dataset.id })
    wx.showToast({ title:'已删除好友', icon:'success' })
    await this.load()
  }
})
