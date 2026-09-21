const api=require('../../utils/api')
Page({
  data:{profile:null,otherExpanded:false,avatarSaving:false,reminderSaving:false,reminderConfig:null},
  onShow(){this.load()},
  async load(){
    const [d,reminderConfig]=await Promise.all([
      api.call('getProfile'),
      api.call('getCheckinReminderSettings',{}, { silent:true }).catch(() => null)
    ])
    d.user.avatar=await api.resolveCloudFileUrl(d.user.avatar)
    d.weightSummary=d.weightStatus?.needUpdate
      ? `该更新了 · 上次：${d.weightStatus.lastUpdateDate || '尚未记录'}`
      : `上次更新：${d.weightStatus?.lastUpdateDate || '尚未记录'}`
    this.setData({profile:d,reminderConfig})
  },
  toggleOther(){this.setData({otherExpanded:!this.data.otherExpanded})},
  async reminderToggle(e){
    if(this.data.reminderSaving)return
    const enabled=Boolean(e.detail.value)
    this.setData({reminderSaving:true})
    try{
      const config=this.data.reminderConfig || await api.call('getCheckinReminderSettings',{}, { silent:true })
      this.setData({reminderConfig:config})
      let grantAccepted=false
      if(enabled&&config.configured&&!config.pushEnabled){
        const result=await wx.requestSubscribeMessage({tmplIds:[config.templateId]})
        grantAccepted=['accept','acceptWithAudio'].includes(result[config.templateId])
      }
      const settings=await api.call('updateCheckinReminderSettings',{
        enabled,time:this.data.profile.user.checkinReminderTime || '21:00',
        timezoneOffset:-new Date().getTimezoneOffset(),grantAccepted
      })
      this.setData({
        reminderConfig:settings,
        'profile.user.checkinReminderEnabled':settings.enabled,
        'profile.user.checkinReminderTime':settings.time,
        'profile.user.checkinReminderPushEnabled':settings.pushEnabled
      })
    }catch(error){
      this.setData({'profile.user.checkinReminderEnabled':!enabled})
      if(!/cancel/i.test(error?.errMsg || ''))wx.showToast({title:api.messageOf(error),icon:'none'})
    }finally{this.setData({reminderSaving:false})}
  },
  async reminderTimeChange(e){
    if(this.data.reminderSaving)return
    const previous=this.data.profile.user.checkinReminderTime || '21:00'
    const time=e.detail.value
    this.setData({reminderSaving:true,'profile.user.checkinReminderTime':time})
    try{
      const settings=await api.call('updateCheckinReminderSettings',{
        enabled:true,time,timezoneOffset:-new Date().getTimezoneOffset()
      })
      this.setData({reminderConfig:settings,'profile.user.checkinReminderTime':settings.time})
    }catch(error){
      this.setData({'profile.user.checkinReminderTime':previous})
    }finally{this.setData({reminderSaving:false})}
  },
  async chooseAvatar(e){
    const path=e.detail.avatarUrl
    if(!path||this.data.avatarSaving)return
    this.setData({avatarSaving:true})
    try{
      const avatar=await api.uploadImage(path,'avatars')
      const result=await api.call('updateProfile',{profile:{avatar}})
      const displayAvatar=await api.resolveCloudFileUrl(result.user.avatar)
      this.setData({'profile.user.avatar':displayAvatar})
      wx.showToast({title:'头像已更新',icon:'success'})
    }finally{this.setData({avatarSaving:false})}
  },
  go(e){wx.navigateTo({url:e.currentTarget.dataset.url})},
  copy(){wx.setClipboardData({data:this.data.profile.user.shareCode})}
})
