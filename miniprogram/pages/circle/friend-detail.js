const api = require('../../utils/api')

const PRIVACY_FIELDS = [
  ['showPlanStatusToFriends','计划完成状态'],
  ['showStudyStatusToFriends','学习状态'],
  ['showStudyDetailsToFriends','学习用时'],
  ['showWorkoutStatusToFriends','运动状态'],
  ['showWorkoutDetailsToFriends','详细训练与用时'],
  ['showWeightToFriends','体重'],
  ['showBodyFatToFriends','体脂率'],
  ['showMeasurementsToFriends','身体围度'],
  ['showDietDetailsToFriends','饮食明细'],
  ['showStreakToFriends','连续完成天数'],
  ['showCompletionRateToFriends','完成率']
]

function decorate(result,currentDate) {
  const first=new Date(`${result.month}-01T12:00:00`)
  const leading=(first.getDay() + 6) % 7
  const blanks=Array.from({ length:leading },(_,index) => ({ key:`blank-${index}`,blank:true }))
  const days=result.days.map(day => ({
    ...day,key:day.date,today:day.date === currentDate
  }))
  return { ...result,cells:[...blanks,...days] }
}

function dateTitle(value) {
  const [year,month,day]=String(value).split('-').map(Number)
  return `${year}年${month}月${day}日`
}

Page({
  data:{
    friendUserId:'',friend:null,calendarVisible:true,settings:null,
    month:api.localDate().slice(0,7),currentDate:api.localDate(),
    weekdayLabels:['一','二','三','四','五','六','日'],calendar:null,selectedDay:null,
    settingsVisible:false,privacyFields:[],notificationConfig:null,isLongTerm:false,saving:false
  },
  onLoad(options){ this.setData({ friendUserId:options.id || '' }); this.load() },
  onShow(){ if (this.data.friendUserId && this.data.friend) this.load() },
  async load(){
    const [result, config] = await Promise.all([
      api.call('getFriendDetail',{ friendUserId:this.data.friendUserId,month:this.data.month }),
      api.call('getSocialNotificationConfig',{}, { silent:true })
    ])
    const settings = result.settings
    this.setData({
      friend:{ ...result.friend,initial:(result.friend.displayName || '?').slice(0,1) },
      calendarVisible:result.calendarVisible,
      calendar:decorate(result.calendar,this.data.currentDate),
      selectedDay:null,
      settings,
      privacyFields:PRIVACY_FIELDS.map(([key,label]) => ({ key,label,checked:Boolean(settings.privacy[key]) })),
      notificationConfig:config,
      isLongTerm:config?.subscriptionType === 'LONG_TERM'
    })
    wx.setNavigationBarTitle({ title:result.friend.displayName || '好友资料' })
  },
  openDay(e) {
    const day=this.data.calendar?.cells?.[Number(e.currentTarget.dataset.index)]
    if (!day || day.blank || !day.inRange || !day.total || !this.data.calendarVisible) return
    this.setData({ selectedDay:{ ...day,title:dateTitle(day.date) } })
  },
  openSettings(){ this.setData({ settingsVisible:true }) },
  closeSettings(){ if (!this.data.saving) { this.setData({ settingsVisible:false }); this.load() } },
  noop(){},
  remarkInput(e){ this.setData({ 'settings.remark':e.detail.value }) },
  pinnedChange(e){ this.setData({ 'settings.pinned':e.detail.value }) },
  privacyModeChange(e){ this.setData({ 'settings.privacyMode':e.detail.value ? 'CUSTOM' : 'DEFAULT' }) },
  privacyChange(e){
    const key=e.currentTarget.dataset.key
    const checked=e.detail.value
    this.setData({
      [`settings.privacy.${key}`]:checked,
      privacyFields:this.data.privacyFields.map(item => item.key === key ? { ...item,checked } : item)
    })
  },
  async saveSettings(){
    if (this.data.saving) return
    this.setData({ saving:true })
    try {
      await api.call('updateFriendSettings',{
        friendUserId:this.data.friendUserId,
        remark:this.data.settings.remark,
        pinned:this.data.settings.pinned,
        privacyMode:this.data.settings.privacyMode,
        privacy:this.data.settings.privacy
      })
      this.setData({ settingsVisible:false })
      wx.showToast({ title:'已保存',icon:'success' })
      await this.load()
    } finally { this.setData({ saving:false }) }
  },
  async specialChange(e){
    const enabled=e.detail.value
    await api.call('setSpecialCare',{ targetUserId:this.data.friendUserId,enabled })
    this.setData({ 'settings.specialCare':enabled,'settings.specialCareWechat':enabled ? this.data.settings.specialCareWechat : false })
  },
  async specialWechatChange(e){
    if (!e.detail.value) {
      await api.call('setSpecialCareWechat',{ targetUserId:this.data.friendUserId,enabled:false })
      return this.setData({ 'settings.specialCareWechat':false })
    }
    const config=this.data.notificationConfig
    if (!config?.configured) {
      wx.showToast({ title:'微信提醒模板尚未配置',icon:'none' })
      return this.setData({ 'settings.specialCareWechat':false })
    }
    try {
      const result=await wx.requestSubscribeMessage({ tmplIds:[config.templateId] })
      const accepted=result[config.templateId] === 'accept'
      await api.call('setSpecialCareWechat',{ targetUserId:this.data.friendUserId,enabled:accepted,grantAccepted:accepted })
      this.setData({ 'settings.specialCareWechat':accepted })
      const title=accepted ? (this.data.isLongTerm ? '已开启长期提醒' : '已订阅下次提醒') : '未开启提醒'
      wx.showToast({ title,icon:'none' })
    } catch (error) {
      this.setData({ 'settings.specialCareWechat':false })
      wx.showToast({ title:'未开启提醒',icon:'none' })
    }
  },
  async removeFriend(){
    if (!await api.confirm('删除后双方将无法查看好友动态，特别关心也会关闭。','删除好友')) return
    await api.call('removeFriend',{ friendUserId:this.data.friendUserId })
    wx.showToast({ title:'已删除好友',icon:'success' })
    setTimeout(() => wx.navigateBack(),350)
  }
})
