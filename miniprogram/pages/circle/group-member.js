const api=require('../../utils/api')
const { promptFriendRequest }=require('../../utils/friend-request')

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
    groupId:'',memberUserId:'',month:api.localDate().slice(0,7),currentDate:api.localDate(),
    weekdayLabels:['一','二','三','四','五','六','日'],calendar:null,member:null,
    friendState:'SELF',selectedDay:null,loading:true
  },
  onLoad(options = {}) { this.setData({ groupId:options.groupId || '',memberUserId:options.memberUserId || '' }) },
  onShow() { if (this.data.groupId && this.data.memberUserId) this.load() },
  async load() {
    this.setData({ loading:true })
    try {
      const result=await api.call('getGroupMemberCalendar',{
        groupId:this.data.groupId,memberUserId:this.data.memberUserId,month:this.data.month
      })
      const avatar=await api.resolveCloudFileUrl(result.member.avatar)
      const calendar=decorate(result,this.data.currentDate)
      const today=calendar.cells.find(item => item.date === this.data.currentDate)
      this.setData({
        member:{ ...result.member,avatar },
        friendState:result.friendState || 'NONE',
        calendar,
        selectedDay:today && today.inRange && today.total ? { ...today,title:dateTitle(today.date) } : null
      })
      wx.setNavigationBarTitle({ title:result.member.nickname || '成员进度' })
    } finally { this.setData({ loading:false }) }
  },
  openDay(e) {
    const day=this.data.calendar?.cells?.[Number(e.currentTarget.dataset.index)]
    if(!day||day.blank||!day.inRange||!day.total)return
    this.setData({ selectedDay:{ ...day,title:dateTitle(day.date) } })
  },
  async addFriend() {
    if (this.data.friendState !== 'NONE') return
    const result=await promptFriendRequest(this.data.memberUserId,this.data.member.nickname)
    if (!result) return
    const friendState=result.friendship?.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING_OUTGOING'
    this.setData({ friendState })
    wx.showToast({ title:result.duplicate ? '申请已存在' : '申请已发送',icon:'success' })
  },
  openFriend() {
    wx.navigateTo({ url:`/pages/circle/friend-detail?id=${this.data.memberUserId}` })
  },
  openFriendRequests() {
    wx.navigateTo({ url:'/pages/circle/friends' })
  }
})
