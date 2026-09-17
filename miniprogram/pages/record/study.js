const api=require('../../utils/api')
const { MOOD_LABELS } = require('../../utils/constants')
Page({
  data:{subject:'',content:'',durationMinutes:'',sessions:[],summary:{},plans:[],planIndex:0,saving:false},
  onShow(){this.load()},
  input(e){this.setData({[e.currentTarget.dataset.key]:e.detail.value})},
  plan(e){this.setData({planIndex:Number(e.detail.value)})},
  async load(){
    const [daily,plans]=await Promise.all([api.call('getDailyStudy'),api.call('getTodayPlans')])
    const studyPlans=[{_id:'',name:'不关联计划'},...plans.plans.filter(p=>p.category==='STUDY'&&!p.completed)]
    const sessions = daily.sessions.map(item => ({
      ...item,
      moodLabel: MOOD_LABELS[item.mood] || '',
      displayNote: [...new Set([item.note, item.completionNote].filter(Boolean))].join(' · '),
      durationLabel: Number(item.durationMinutes || 0) > 0 ? `${item.durationMinutes} min` : '未填写用时'
    }))
    this.setData({sessions,summary:daily.summary,plans:studyPlans,planIndex:0})
  },
  writeNote(e){
    const id=e.currentTarget.dataset.id
    const title=encodeURIComponent(e.currentTarget.dataset.title||'学习笔记')
    wx.navigateTo({url:`/pages/notes/edit?type=STUDY&relatedType=STUDY_SESSION&relatedId=${id}&title=${title}`})
  },
  async save(){
    if(this.data.saving)return
    const minutes=Number(this.data.durationMinutes)
    if(!Number.isFinite(minutes)||minutes<=0)return wx.showToast({title:'请输入有效学习时长',icon:'none'})
    this.setData({saving:true})
    try{
      const selected=this.data.plans[this.data.planIndex]
      const result=await api.call('addStudySession',{subject:this.data.subject||'学习',content:this.data.content,durationMinutes:minutes,planId:selected?selected._id:''})
      wx.showToast({title:result.planAutoCompleted?'已记录并完成计划':'已记录',icon:'success'})
      this.setData({content:'',durationMinutes:''})
      await this.load()
    }finally{this.setData({saving:false})}
  }
})
