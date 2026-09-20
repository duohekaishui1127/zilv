const api = require('../../utils/api')

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: {
    id:'', group:null, members:[], events:[], eventsExpanded:false, isOwner:false,
    wechatEnabled:false, notificationConfig:null, isLongTerm:false,
    permissions:null,pendingRequests:[],savingPermissions:false
  },
  onLoad(options) { this.setData({ id:options.id || '' }) },
  onShow() { if (this.data.id) this.load() },
  async load() {
    const [detail, config] = await Promise.all([
      api.call('getGroupDetail', { groupId:this.data.id }),
      api.call('getSocialNotificationConfig', {}, { silent:true })
    ])
    this.setData({
      group:detail.group,
      members:detail.members.map(item => ({ ...item,initial:(item.nickname || '?').slice(0,1) })),
      events:detail.events.map(item => ({ ...item,displayTime:displayTime(item.createdAt) })),
      isOwner:detail.currentRole === 'OWNER',
      permissions:detail.permissions,
      pendingRequests:(detail.pendingRequests || []).map(item => ({ ...item,user:{ ...item.user,initial:(item.user.nickname || '?').slice(0,1) } })),
      wechatEnabled:detail.wechatCheckinEnabled,
      notificationConfig:config,
      isLongTerm:config?.subscriptionType === 'LONG_TERM'
    })
  },
  permissionSwitch(e) {
    const key=e.currentTarget.dataset.key
    this.setData({ [`permissions.${key}`]:e.detail.value })
  },
  autoRemoveSwitch(e) {
    this.setData({ 'permissions.autoRemoveInactiveDays':e.detail.value ? (this.data.permissions.autoRemoveInactiveDays || 7) : 0 })
  },
  autoRemoveDaysInput(e) {
    this.setData({ 'permissions.autoRemoveInactiveDays':e.detail.value })
  },
  async savePermissions() {
    if (this.data.savingPermissions) return
    const days=Number(this.data.permissions.autoRemoveInactiveDays || 0)
    if (!Number.isInteger(days) || days < 0 || days > 365) return wx.showToast({ title:'请输入 1-365 天',icon:'none' })
    this.setData({ savingPermissions:true })
    try {
      const result=await api.call('updateGroupSettings',{ groupId:this.data.id,permissions:{ ...this.data.permissions,autoRemoveInactiveDays:days } })
      this.setData({ permissions:result.permissions })
      wx.showToast({ title:'群权限已保存',icon:'success' })
      await this.load()
    } finally { this.setData({ savingPermissions:false }) }
  },
  async reviewJoin(e) {
    const membershipId=e.currentTarget.dataset.id
    const approve=e.currentTarget.dataset.approve === 'true'
    await api.call('reviewGroupJoinRequest',{ groupId:this.data.id,membershipId,approve })
    wx.showToast({ title:approve ? '已同意入群' : '已拒绝',icon:approve ? 'success' : 'none' })
    await this.load()
  },
  openMember(e) {
    wx.navigateTo({ url:`/pages/circle/group-member?groupId=${this.data.id}&memberUserId=${e.currentTarget.dataset.id}` })
  },
  toggleEvents() { this.setData({ eventsExpanded:!this.data.eventsExpanded }) },
  async toggleWechat(e) {
    const enabled=e.detail.value
    if (!enabled) {
      await api.call('setGroupWechatNotification',{ groupId:this.data.id,enabled:false })
      return this.setData({ wechatEnabled:false })
    }
    const config=this.data.notificationConfig
    if (!config?.configured) {
      this.setData({ wechatEnabled:false })
      return wx.showToast({ title:'微信提醒模板尚未配置',icon:'none' })
    }
    try {
      const result=await wx.requestSubscribeMessage({ tmplIds:[config.templateId] })
      const accepted=result[config.templateId] === 'accept'
      await api.call('setGroupWechatNotification',{ groupId:this.data.id,enabled:accepted,grantAccepted:accepted })
      this.setData({ wechatEnabled:accepted })
      const title=accepted ? (this.data.isLongTerm ? '已开启长期提醒' : '已订阅下次提醒') : '未开启提醒'
      wx.showToast({ title,icon:'none' })
    } catch (error) {
      this.setData({ wechatEnabled:false })
      wx.showToast({ title:'未开启提醒',icon:'none' })
    }
  },
  async toggleLike(e) {
    const index=Number(e.currentTarget.dataset.index)
    const item=this.data.events[index]
    if (!item) return
    const result=await api.call('toggleGroupEventLike',{ eventId:item._id })
    this.setData({
      [`events[${index}].likedByMe`]:result.liked,
      [`events[${index}].likeCount`]:result.likeCount
    })
  },
  async leave() {
    if (!await api.confirm('退出后，该群绑定的计划会自动解除绑定。','退出群组')) return
    await api.call('leaveGroup',{ groupId:this.data.id })
    wx.showToast({ title:'已退出',icon:'success' })
    setTimeout(() => wx.navigateBack(),350)
  }
})
