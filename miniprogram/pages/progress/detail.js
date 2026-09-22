const api=require('../../utils/api')

const RESULT_OPTIONS=Object.freeze([
  { value:'PENDING',label:'待出分' },
  { value:'PASSED',label:'已通过' },
  { value:'FAILED',label:'未通过' },
  { value:'ABSENT',label:'未参加' }
])

function durationLabel(value) {
  const minutes=Math.max(0,Number(value || 0))
  if(!minutes)return '0 分钟'
  if(minutes < 60)return `${Math.round(minutes)} 分钟`
  const hours=Math.round(minutes / 6) / 10
  return `${hours} 小时`
}

function dateText(value) {
  const text=String(value || '')
  const direct=text.match(/^\d{4}-\d{2}-\d{2}/)
  if(direct)return direct[0]
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return '--'
  const pad=number => String(number).padStart(2,'0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function present(goal) {
  const snapshot=goal.archiveSnapshot || {}
  const isExam=goal.goalType === 'DEADLINE'
  return {
    ...goal,isExam,snapshot,
    createdDate:dateText(snapshot.createdDate || goal.startDate || goal.createdAt),
    examDate:dateText(snapshot.examDate || goal.deadlineDate),
    completedDate:dateText(goal.completedAt),
    preparationDays:Number(snapshot.preparationDays || 0),
    completedCount:Number(snapshot.completedCount || 0),
    durationText:durationLabel(snapshot.durationMinutes),
    completionText:snapshot.completionPct == null ? '--' : `${snapshot.completionPct}%`,
    linkedPlans:snapshot.linkedPlans || []
  }
}

Page({
  data:{
    id:'',loading:true,saving:false,goal:null,resultOptions:RESULT_OPTIONS,
    resultStatus:'PENDING',score:'',review:''
  },
  onLoad(options){this.setData({ id:options.id || '' });this.load()},
  async load(){
    if(!this.data.id)return
    this.setData({ loading:true })
    try{
      const result=await api.call('getProgressGoal',{ goalId:this.data.id },{ silent:true })
      const goal=present(result.goal)
      this.setData({
        goal,resultStatus:goal.examResultStatus || 'PENDING',
        score:goal.examScore || '',review:goal.examReview || ''
      })
      wx.setNavigationBarTitle({ title:goal.name || '进步详情' })
    }catch(error){
      wx.showToast({ title:api.messageOf(error),icon:'none' })
    }finally{this.setData({ loading:false })}
  },
  chooseResult(e){this.setData({ resultStatus:e.currentTarget.dataset.value })},
  input(e){this.setData({ [e.currentTarget.dataset.key]:e.detail.value })},
  async save(){
    if(this.data.saving)return
    this.setData({ saving:true })
    try{
      await api.call('updateExamGoalResult',{
        goalId:this.data.id,resultStatus:this.data.resultStatus,
        score:this.data.score,review:this.data.review
      })
      wx.showToast({ title:'考试记录已保存',icon:'success' })
      await this.load()
    }finally{this.setData({ saving:false })}
  }
})
