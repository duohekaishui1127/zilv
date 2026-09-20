const api=require('../../utils/api')
Page({
  data:{profile:null,otherExpanded:false,avatarSaving:false},
  onShow(){this.load()},
  async load(){
    const d=await api.call('getProfile')
    d.weightSummary=d.weightStatus?.needUpdate
      ? `该更新了 · 上次：${d.weightStatus.lastUpdateDate || '尚未记录'}`
      : `上次更新：${d.weightStatus?.lastUpdateDate || '尚未记录'}`
    this.setData({profile:d})
  },
  toggleOther(){this.setData({otherExpanded:!this.data.otherExpanded})},
  async chooseAvatar(e){
    const path=e.detail.avatarUrl
    if(!path||this.data.avatarSaving)return
    this.setData({avatarSaving:true})
    try{
      const avatar=await api.uploadImage(path,'avatars')
      const result=await api.call('updateProfile',{profile:{avatar}})
      this.setData({'profile.user.avatar':result.user.avatar})
      wx.showToast({title:'头像已更新',icon:'success'})
    }finally{this.setData({avatarSaving:false})}
  },
  go(e){wx.navigateTo({url:e.currentTarget.dataset.url})},
  copy(){wx.setClipboardData({data:this.data.profile.user.shareCode})}
})
