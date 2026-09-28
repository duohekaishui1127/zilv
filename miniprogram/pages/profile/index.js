const api=require('../../utils/api')
const { getCheckinReminderClient }=require('../../utils/checkin-reminder')
const { normalizedNickname,profileNeedsIdentity }=require('../../domain/profile-identity')
const canReviewNickname=wx.canIUse('input.bindnicknamereview')
Page({
  data:{profile:null,nicknameDraft:'',profileIncomplete:false,otherExpanded:false,avatarSaving:false,nicknameSaving:false,reminderSaving:false,reminderConfig:null,reminderSettingsVisible:false,reminderFeedback:'',reminderFeedbackError:false},
  onShow(){if(!this.data.reminderSaving)this.load()},
  async load(){
    const loadId=Number(this._profileLoadId || 0)+1
    this._profileLoadId=loadId
    const reminderRevision=this._reminderRevision || 0
    const [d,reminderConfig]=await Promise.all([
      api.call('getProfile'),
      api.call('getCheckinReminderSettings',{}, { silent:true }).catch(() => null)
    ])
    if(reminderConfig?.templateId)getCheckinReminderClient(wx,api).refresh(reminderConfig.templateId)
    const savedAvatar=d.user.avatar
    d.user.avatar=await api.resolveCloudFileUrl(savedAvatar)
    d.weightSummary=d.weightStatus?.needUpdate
      ? `该更新了 · 上次：${d.weightStatus.lastUpdateDate || '尚未记录'}`
      : `上次更新：${d.weightStatus?.lastUpdateDate || '尚未记录'}`
    if(loadId!==this._profileLoadId)return
    const preserveReminder=this.data.reminderSaving||reminderRevision!==(this._reminderRevision || 0)
    if(preserveReminder&&this.data.profile){
      for(const key of ['checkinReminderEnabled','checkinReminderTime','checkinReminderPushEnabled'])d.user[key]=this.data.profile.user[key]
    }else if(reminderConfig){
      d.user.checkinReminderEnabled=reminderConfig.enabled
      d.user.checkinReminderTime=reminderConfig.time
      d.user.checkinReminderPushEnabled=reminderConfig.pushEnabled
    }
    this.setData({
      profile:d,
      nicknameDraft:d.user.nickname || '',
      profileIncomplete:profileNeedsIdentity({ ...d.user,avatar:savedAvatar }),
      reminderConfig:preserveReminder ? this.data.reminderConfig : reminderConfig
    })
  },
  toggleOther(){this.setData({otherExpanded:!this.data.otherExpanded})},
  noop(){},
  openReminderSettings(){this.setData({reminderSettingsVisible:true,reminderFeedback:'',reminderFeedbackError:false})},
  closeReminderSettings(){if(!this.data.reminderSaving)this.setData({reminderSettingsVisible:false})},
  applyReminderSettings(settings){
    this.setData({
      reminderConfig:settings,
      'profile.user.checkinReminderEnabled':settings.enabled,
      'profile.user.checkinReminderTime':settings.time,
      'profile.user.checkinReminderPushEnabled':settings.pushEnabled
    })
  },
  async reminderToggle(e){
    if(this.data.reminderSaving)return
    const enabled=Boolean(e.detail.value)
    const previous=Boolean(this.data.profile.user.checkinReminderEnabled)
    const config=this.data.reminderConfig
    this._reminderRevision=Number(this._reminderRevision || 0)+1
    this.setData({reminderSaving:true,reminderFeedback:'',reminderFeedbackError:false,'profile.user.checkinReminderEnabled':enabled})
    // Invoke the native API in this tap, before any cloud request or await.
    const authorization=enabled&&config?.configured&&!config.pushEnabled
      ? getCheckinReminderClient(wx,api).authorize(config.templateId) : Promise.resolve(false)
    try{
      const grantAccepted=await authorization
      const settings=await api.call('updateCheckinReminderSettings',{
        enabled,time:this.data.profile.user.checkinReminderTime || '21:00',
        timezoneOffset:-new Date().getTimezoneOffset(),grantAccepted
      },{silent:true})
      this.applyReminderSettings(settings)
      if(enabled&&settings.configured&&!settings.pushEnabled)this.setData({reminderFeedback:'未获得微信授权，打卡记录不受影响。可点击下方允许提醒。'})
    }catch(error){
      this.setData({'profile.user.checkinReminderEnabled':previous,reminderFeedback:api.messageOf(error),reminderFeedbackError:true})
    }finally{this.setData({reminderSaving:false})}
  },
  async renewReminderFromSettings(){
    if(this.data.reminderSaving||!this.data.profile.user.checkinReminderEnabled)return
    const config=this.data.reminderConfig
    if(!config?.configured)return this.setData({reminderFeedback:'微信通知暂不可用，打卡记录不受影响。'})
    if(config.pushEnabled)return
    if(config.subscriptionType==='LONG_TERM')return this.reminderToggle({detail:{value:true}})
    this._reminderRevision=Number(this._reminderRevision || 0)+1
    this.setData({reminderSaving:true,reminderFeedback:'',reminderFeedbackError:false})
    const renewal=getCheckinReminderClient(wx,api).renew({...config,enabled:true},{force:true})
    try{
      const renewed=await renewal
      if(renewed){
        this.applyReminderSettings({...config,enabled:true,pushEnabled:true})
        this.setData({reminderFeedback:'微信提醒已允许'})
      }else{
        this.setData({reminderFeedback:'暂未获得提醒机会，打卡记录不受影响。若曾关闭微信授权，可在小程序设置中调整。'})
      }
    }finally{this.setData({reminderSaving:false})}
  },
  async reminderTimeChange(e){
    if(this.data.reminderSaving||!this.data.profile.user.checkinReminderEnabled)return
    const previous=this.data.profile.user.checkinReminderTime || '21:00'
    const time=e.detail.value
    if(time===previous)return
    this._reminderRevision=Number(this._reminderRevision || 0)+1
    this.setData({reminderSaving:true,'profile.user.checkinReminderTime':time,reminderFeedback:'',reminderFeedbackError:false})
    try{
      const settings=await api.call('updateCheckinReminderSettings',{
        enabled:true,time,timezoneOffset:-new Date().getTimezoneOffset()
      },{silent:true})
      this.applyReminderSettings(settings)
    }catch(error){
      this.setData({'profile.user.checkinReminderTime':previous,reminderFeedback:api.messageOf(error),reminderFeedbackError:true})
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
      this.setData({'profile.user.avatar':displayAvatar,profileIncomplete:profileNeedsIdentity(result.user)})
      wx.showToast({title:'头像已更新',icon:'success'})
    }finally{this.setData({avatarSaving:false})}
  },
  nicknameInput(e){this.setData({nicknameDraft:e.detail.value})},
  nicknameBlur(e){
    const nickname=normalizedNickname(e.detail.value)
    this.setData({nicknameDraft:nickname})
    if(canReviewNickname){this.pendingNickname=nickname;return}
    this.saveNickname(nickname)
  },
  nicknameReview(e){
    if(e.detail.pass)return this.saveNickname(this.pendingNickname)
    this.pendingNickname=''
    this.setData({nicknameDraft:this.data.profile.user.nickname})
    wx.showToast({title:'昵称未通过审核，请换一个',icon:'none'})
  },
  async saveNickname(value){
    const nickname=normalizedNickname(value)
    const previous=this.data.profile.user.nickname
    if(!nickname){
      this.setData({nicknameDraft:previous})
      return wx.showToast({title:'昵称不能为空',icon:'none'})
    }
    if(nickname===previous||this.data.nicknameSaving)return
    this.setData({nicknameSaving:true})
    try{
      const result=await api.call('updateProfile',{profile:{nickname}})
      this.setData({
        nicknameDraft:result.user.nickname,
        'profile.user.nickname':result.user.nickname,
        profileIncomplete:profileNeedsIdentity(result.user)
      })
    }catch(error){
      this.setData({nicknameDraft:previous})
    }finally{this.setData({nicknameSaving:false})}
  },
  go(e){wx.navigateTo({url:e.currentTarget.dataset.url})},
  copy(){wx.setClipboardData({data:this.data.profile.user.shareCode})}
})
