const api=require('../../utils/api')

function decorate(result,currentDate) {
  const first=new Date(`${result.month}-01T12:00:00`)
  const leading=(first.getDay() + 6) % 7
  const blanks=Array.from({ length:leading },(_,index) => ({ key:`blank-${index}`,blank:true }))
  const days=result.days.map(day => ({
    ...day,key:day.date,today:day.date === currentDate,
    statusClass:`status-${String(day.status || 'NONE').toLowerCase()}`
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
    weekdayLabels:['一','二','三','四','五','六','日'],calendar:null,member:null,selectedDay:null,loading:true
  },
  onLoad(options = {}) { this.setData({ groupId:options.groupId || '',memberUserId:options.memberUserId || '' }) },
  onShow() { if (this.data.groupId && this.data.memberUserId) this.load() },
  async load() {
    this.setData({ loading:true })
    try {
      const result=await api.call('getGroupMemberCalendar',{
        groupId:this.data.groupId,memberUserId:this.data.memberUserId,month:this.data.month
      })
      this.setData({ member:result.member,calendar:decorate(result,this.data.currentDate),selectedDay:null })
      wx.setNavigationBarTitle({ title:result.member.nickname || '成员进度' })
    } finally { this.setData({ loading:false }) }
  },
  openDay(e) {
    const day=this.data.calendar?.cells?.[Number(e.currentTarget.dataset.index)]
    if (!day || day.blank) return
    this.setData({ selectedDay:{ ...day,title:dateTitle(day.date) } })
  }
})
