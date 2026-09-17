const api=require('../../utils/api')
Page({
  data:{profile:null},
  onShow(){this.load()},
  async load(){
    const d=await api.call('getProfile')
    d.weightSummary=d.weightStatus?.needUpdate
      ? `该更新了 · 上次：${d.weightStatus.lastUpdateDate || '尚未记录'}`
      : `上次更新：${d.weightStatus?.lastUpdateDate || '尚未记录'}`
    this.setData({profile:d})
  },
  go(e){wx.navigateTo({url:e.currentTarget.dataset.url})},
  copy(){wx.setClipboardData({data:this.data.profile.user.shareCode})}
})
