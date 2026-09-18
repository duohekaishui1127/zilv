const api = require('../../utils/api')

function inviteResultTitle(result) {
  if (result.sent) return `已邀请 ${result.sent} 人`
  if (result.duplicate) return '今天已经邀请过了'
  return '对方已在群组中'
}

Page({
  data: {
    inviteCode:'', groups:[], pendingInviteCode:'', pendingInviteName:'', invitationHandled:false,
    inviteVisible:false, inviteGroup:null, inviteFriends:[], selectedCount:0, personalId:'', inviting:false
  },
  onLoad(options = {}) {
    let pendingInviteName = ''
    try { pendingInviteName = decodeURIComponent(options.inviteName || '') } catch (error) {}
    this.setData({ pendingInviteCode:options.inviteCode || '', pendingInviteName })
  },
  onShow() { this.load() },
  input(e) { this.setData({ inviteCode:e.detail.value.toUpperCase() }) },
  personalInput(e) { this.setData({ personalId:e.detail.value.trim() }) },
  async load() {
    const result = await api.call('getGroups')
    this.setData({ groups:result.groups })
    await this.promptInvitation()
  },
  async promptInvitation() {
    if (!this.data.pendingInviteCode || this.data.invitationHandled) return
    this.setData({ invitationHandled:true })
    const result = await wx.showModal({
      title:'群组邀请',
      content:`是否加入${this.data.pendingInviteName ? `「${this.data.pendingInviteName}」` : '这个群组'}？`,
      confirmText:'加入群组'
    })
    if (!result.confirm) return
    await this.joinByCode(this.data.pendingInviteCode)
  },
  create() { wx.navigateTo({ url:'/pages/circle/group-create' }) },
  detail(e) { wx.navigateTo({ url:`/pages/circle/group-detail?id=${e.currentTarget.dataset.id}` }) },
  async joinByCode(code) {
    await api.call('joinGroup', { inviteCode:code })
    wx.showToast({ title:'已加入',icon:'success' })
    this.setData({ inviteCode:'', pendingInviteCode:'' })
    await this.load()
  },
  async join() {
    const code=this.data.inviteCode.trim()
    if (!code) return wx.showToast({ title:'请输入群组 ID',icon:'none' })
    await this.joinByCode(code)
  },
  copyGroupId(e) { wx.setClipboardData({ data:e.currentTarget.dataset.code }) },
  async openInvite(e) {
    const result=await api.call('getGroupInviteCandidates',{ groupId:e.currentTarget.dataset.id })
    this.setData({
      inviteVisible:true,
      inviteGroup:result.group,
      inviteFriends:(result.friends || []).map(item => ({ ...item,selected:false })),
      selectedCount:0,
      personalId:''
    })
  },
  closeInvite() { if (!this.data.inviting) this.setData({ inviteVisible:false }) },
  noop() {},
  toggleInviteFriend(e) {
    const index=Number(e.currentTarget.dataset.index)
    const friends=this.data.inviteFriends.map((item,i) => i === index ? { ...item,selected:!item.selected } : item)
    this.setData({ inviteFriends:friends,selectedCount:friends.filter(item => item.selected).length })
  },
  async sendSelectedInvites() {
    const targetUserIds=this.data.inviteFriends.filter(item => item.selected).map(item => item._id)
    if (!targetUserIds.length) return wx.showToast({ title:'请先选择好友',icon:'none' })
    await this.sendInvites({ targetUserIds })
  },
  async sendPersonalInvite() {
    if (!this.data.personalId) return wx.showToast({ title:'请输入个人 ID',icon:'none' })
    await this.sendInvites({ personalId:this.data.personalId })
  },
  async sendInvites(payload) {
    if (this.data.inviting) return
    this.setData({ inviting:true })
    try {
      const result=await api.call('inviteUsersToGroup',{ groupId:this.data.inviteGroup._id,...payload })
      wx.showToast({ title:inviteResultTitle(result),icon:result.sent ? 'success' : 'none' })
      if (result.sent) this.setData({ inviteVisible:false })
    } finally { this.setData({ inviting:false }) }
  }
})
