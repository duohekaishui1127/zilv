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
    permissions:null,pendingRequests:[],pendingPlanChanges:[],savingPermissions:false,disbanding:false
  },
  onLoad(options) { this.setData({ id:options.id || '' }) },
  onShow() { if (this.data.id) this.load() },
  async load() {
    const detail=await api.call('getGroupDetail', { groupId:this.data.id })
    const memberCount=detail.members.length
    const avatarUrls=await api.resolveCloudFileUrls([
      ...detail.members.map(item => item.avatar),
      ...(detail.pendingRequests || []).map(item => item.user.avatar)
    ])
    this.setData({
      group:detail.group,
      members:detail.members.map((item,index) => ({
        ...item,avatar:avatarUrls[index],initial:(item.nickname || '?').slice(0,1)
      })),
      events:detail.events.map(item => ({ ...item,displayTime:displayTime(item.createdAt) })),
      isOwner:detail.currentRole === 'OWNER',
      permissions:detail.permissions,
      pendingRequests:(detail.pendingRequests || []).map((item,index) => ({
        ...item,user:{
          ...item.user,avatar:avatarUrls[memberCount + index],initial:(item.user.nickname || '?').slice(0,1)
        }
      })),
      pendingPlanChanges:(detail.pendingPlanChanges || []).map(item => ({
        ...item,
        detail:item.proposedPlan
          ? `${item.currentPlan.name} → ${item.proposedPlan.name} · 目标 ${item.proposedPlan.targetValue}${item.proposedPlan.unit || ''}`
          : `${item.currentPlan.name} · 已通过 ${item.approvedCount}/${item.requiredCount} 个群`
      }))
    })
    wx.setNavigationBarTitle({ title:detail.group.displayName || detail.group.name || '群组详情' })
  },
  async persistPermissions(permissions) {
    if (this.data.savingPermissions) return
    this.setData({ permissions,savingPermissions:true })
    try {
      const result=await api.call('updateGroupSettings',{ groupId:this.data.id,permissions })
      this.setData({ permissions:result.permissions })
    } catch (error) {
      await this.load()
    } finally { this.setData({ savingPermissions:false }) }
  },
  permissionSwitch(e) {
    const key=e.currentTarget.dataset.key
    return this.persistPermissions({ ...this.data.permissions,[key]:Boolean(e.detail.value) })
  },
  autoRemoveSwitch(e) {
    return this.persistPermissions({
      ...this.data.permissions,
      autoRemoveInactiveDays:e.detail.value ? (Number(this.data.permissions.autoRemoveInactiveDays) || 7) : 0
    })
  },
  autoRemoveDaysInput(e) {
    this.setData({ 'permissions.autoRemoveInactiveDays':e.detail.value })
  },
  autoRemoveDaysChange() {
    const days=Number(this.data.permissions.autoRemoveInactiveDays || 0)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      this.setData({ 'permissions.autoRemoveInactiveDays':7 })
      return wx.showToast({ title:'请输入 1-365 天',icon:'none' })
    }
    return this.persistPermissions({ ...this.data.permissions,autoRemoveInactiveDays:days })
  },
  async reviewJoin(e) {
    const membershipId=e.currentTarget.dataset.id
    const approve=e.currentTarget.dataset.approve === 'true'
    await api.call('reviewGroupJoinRequest',{ groupId:this.data.id,membershipId,approve })
    wx.showToast({ title:approve ? '已同意入群' : '已拒绝',icon:approve ? 'success' : 'none' })
    await this.load()
  },
  async reviewPlanChange(e) {
    const requestId=e.currentTarget.dataset.id
    const approve=e.currentTarget.dataset.approve === 'true'
    const result=await api.call('reviewGroupPlanChange',{ groupId:this.data.id,requestId,approve })
    const title=!approve ? '已拒绝变更' : (result.waiting ? '已同意，等待其他群主' : '已同意并生效')
    wx.showToast({ title,icon:approve && !result.waiting ? 'success' : 'none' })
    await this.load()
  },
  async kickMember(e) {
    let choice
    try { choice=await wx.showActionSheet({ itemList:['移出，允许重新申请','移出并禁止再次加入'] }) } catch (error) { return }
    const blockRejoin=choice.tapIndex === 1
    if(!await api.confirm(`确认将${e.currentTarget.dataset.name || '该成员'}移出群组？`,'移出成员'))return
    await api.call('removeGroupMember',{ groupId:this.data.id,memberUserId:e.currentTarget.dataset.id,blockRejoin })
    wx.showToast({ title:'已移出成员',icon:'success' })
    await this.load()
  },
  openMember(e) {
    wx.navigateTo({ url:`/pages/circle/group-member?groupId=${this.data.id}&memberUserId=${e.currentTarget.dataset.id}` })
  },
  toggleEvents() { this.setData({ eventsExpanded:!this.data.eventsExpanded }) },
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
  },
  async disband() {
    if (this.data.disbanding) return
    const confirmed=await api.confirm(
      '解散后所有成员将退出，群组动态不再显示，相关计划会解除绑定。此操作无法撤销。',
      '解散群聊'
    )
    if (!confirmed) return
    this.setData({ disbanding:true })
    try {
      await api.call('disbandGroup',{ groupId:this.data.id })
      wx.showToast({ title:'群聊已解散',icon:'success' })
      setTimeout(() => wx.navigateBack(),350)
    } finally { this.setData({ disbanding:false }) }
  }
})
