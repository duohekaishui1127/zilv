const api=require('../../utils/api')
Page({
  data:{profile:null},
  onShow(){this.load()},
  async load(){const d=await api.call('getProfile');this.setData({profile:d})},
  go(e){wx.navigateTo({url:e.currentTarget.dataset.url})},
  copy(){wx.setClipboardData({data:this.data.profile.user.shareCode})}
})
