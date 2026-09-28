const api=require('../../utils/api')
Page({
  data:{gate:null,checked:false,loading:true,submitting:false},
  onLoad(){this.load()},
  async load(){
    try{
      const gate=await api.call('getLegalGate',{}, {silent:true})
      this.setData({gate,loading:false})
      if(gate.accepted) setTimeout(() => wx.switchTab({url:'/pages/calendar/index'}),120)
    }catch(error){
      this.setData({loading:false})
      wx.showToast({title:api.messageOf(error),icon:'none'})
    }
  },
  toggle(){this.setData({checked:!this.data.checked})},
  openTerms(){wx.navigateTo({url:'/pages/legal/terms'})},
  openPrivacy(){wx.navigateTo({url:'/pages/legal/privacy'})},
  async accept(){
    if(!this.data.checked)return wx.showToast({title:'请先阅读并勾选同意',icon:'none'})
    if(this.data.submitting||!this.data.gate)return
    this.setData({submitting:true})
    try{
      await api.call('acceptLegal',{
        accepted:true,
        termsVersion:this.data.gate.termsVersion,
        privacyVersion:this.data.gate.privacyVersion
      })
      try{wx.setStorageSync('zilvLegalVersion',`${this.data.gate.termsVersion}/${this.data.gate.privacyVersion}`)}catch(e){}
      wx.switchTab({url:'/pages/calendar/index'})
    }finally{this.setData({submitting:false})}
  },
  exit(){
    if(wx.exitMiniProgram) wx.exitMiniProgram({})
    else wx.showToast({title:'请关闭小程序后再退出',icon:'none'})
  }
})
