const api = require('../../utils/api')
Page({
  data: { shareCode:'', found:null, friends:[], requests:[], outgoing:[] },
  onShow() { this.load() },
  input(e) { this.setData({ shareCode: e.detail.value.toUpperCase(), found: null }) },
  async load() {
    const [f, r] = await Promise.all([api.call('getFriends'), api.call('getFriendRequests')])
    this.setData({ friends: f.friends, requests: r.requests, outgoing:r.outgoing || [] })
    if (r.requests.length) wx.showTabBarRedDot({ index:3 })
    else wx.hideTabBarRedDot({ index:3 })
  },
  async find() {
    const code = this.data.shareCode.trim()
    if (!code) return wx.showToast({ title:'请输入好友码', icon:'none' })
    const d = await api.call('findUserByShareCode', { shareCode: code })
    this.setData({ found: d.user })
  },
  async add() {
    if (!this.data.found) return
    const result=await api.call('sendFriendRequest', { targetUserId: this.data.found._id })
    const title=result.friendship?.status === 'ACCEPTED' ? '已经是好友' : (result.duplicate ? '申请已存在' : '已发送')
    wx.showToast({ title, icon:'success' })
    this.setData({ found:null, shareCode:'' })
  },
  async accept(e) {
    await api.call('acceptFriendRequest', { friendshipId: e.currentTarget.dataset.id })
    await this.load()
    const result=await wx.showModal({
      title:'已添加好友',
      content:'当前会使用“我的”中的统一好友隐私设置。你也可以进入好友资料，为这个好友单独设置可见范围。',
      confirmText:'隐私设置',
      cancelText:'知道了'
    })
    if (result.confirm) wx.navigateTo({ url:'/pages/profile/privacy' })
  },
  async reject(e) {
    await api.call('rejectFriendRequest',{ friendshipId:e.currentTarget.dataset.id })
    wx.showToast({ title:'已拒绝',icon:'success' })
    await this.load()
  },
  async cancel(e) {
    if (!await api.confirm('撤回后，对方将不能再处理这条申请。','撤回申请')) return
    await api.call('cancelFriendRequest',{ friendshipId:e.currentTarget.dataset.id })
    wx.showToast({ title:'已撤回',icon:'success' })
    await this.load()
  },
  openFriend(e) { wx.navigateTo({ url:`/pages/circle/friend-detail?id=${e.currentTarget.dataset.id}` }) }
})
