const api = require('../../utils/api')
const { promptFriendRequest } = require('../../utils/friend-request')
const { pinnedFirst } = require('../../utils/social-list')
Page({
  data: { shareCode:'', found:null, friends:[], requests:[], outgoing:[] },
  onShow() { this.load() },
  input(e) { this.setData({ shareCode: e.detail.value.toUpperCase(), found: null }) },
  async load() {
    const [f, r] = await Promise.all([api.call('getFriends'), api.call('getFriendRequests')])
    const friends=pinnedFirst(f.friends)
    const requests=r.requests || []
    const outgoing=r.outgoing || []
    const avatarUrls=await api.resolveCloudFileUrls([
      ...friends.map(item => item.avatar),
      ...requests.map(item => item.user.avatar),
      ...outgoing.map(item => item.user.avatar)
    ])
    const requestOffset=friends.length
    const outgoingOffset=requestOffset + requests.length
    this.setData({
      friends:friends.map((item,index) => ({
        ...item,avatar:avatarUrls[index],initial:(item.displayName || item.nickname || '?').slice(0,1)
      })),
      requests:requests.map((item,index) => ({
        ...item,user:{ ...item.user,avatar:avatarUrls[requestOffset + index],initial:(item.user.nickname || '?').slice(0,1) }
      })),
      outgoing:outgoing.map((item,index) => ({
        ...item,user:{ ...item.user,avatar:avatarUrls[outgoingOffset + index],initial:(item.user.nickname || '?').slice(0,1) }
      }))
    })
    if (r.requests.length) wx.showTabBarRedDot({ index:3 })
    else wx.hideTabBarRedDot({ index:3 })
  },
  async find() {
    const code = this.data.shareCode.trim()
    if (!code) return wx.showToast({ title:'请输入好友码', icon:'none' })
    const d = await api.call('findUserByShareCode', { shareCode: code })
    const avatar=await api.resolveCloudFileUrl(d.user.avatar)
    this.setData({ found:{ ...d.user,avatar,initial:(d.user.nickname || '?').slice(0,1) } })
  },
  async add() {
    if (!this.data.found) return
    const result=await promptFriendRequest(this.data.found._id,this.data.found.nickname)
    if (!result) return
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
