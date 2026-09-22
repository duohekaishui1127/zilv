const api=require('../../utils/api')
const { LONG_TERM_GOAL_TYPES }=require('../../utils/constants')

const TYPE_LABELS=Object.fromEntries(LONG_TERM_GOAL_TYPES.map(item => [item.value,item.label]))
const RESULT_LABELS={ PENDING:'待出分',PASSED:'已通过',FAILED:'本次未通过',ABSENT:'未参加' }

function goalView(goal) {
  const snapshot=goal.archiveSnapshot || {}
  let statusLabel='已完成'
  let summary=''
  if(goal.goalType === 'DEADLINE') {
    statusLabel=RESULT_LABELS[goal.examResultStatus || 'PENDING']
    summary=`考试日 ${goal.deadlineDate}`
    if(snapshot.preparationDays)summary += ` · 准备 ${snapshot.preparationDays} 天`
  } else if(goal.goalType === 'HABIT') {
    statusLabel='已养成'
    summary=`连续完成 ${goal.targetValue || goal.habitDays || 21} 天`
  } else {
    statusLabel='已达成'
    summary=goal.unlimited ? `累计完成 ${goal.totalCompletedCount || 0} 次` : `完成 ${goal.targetValue}${goal.unit || ''}`
  }
  return {
    ...goal,typeLabel:goal.goalType === 'DEADLINE' ? '考试计划' : (TYPE_LABELS[goal.goalType] || '长期目标'),
    statusLabel,summary
  }
}

Page({
  data:{ loading:true,goals:[] },
  onShow(){this.load()},
  async load(){
    this.setData({ loading:true })
    try{
      const result=await api.call('getProgressGoals',{}, { silent:true })
      this.setData({ goals:(result.goals || []).map(goalView) })
    }catch(error){
      wx.showToast({ title:api.messageOf(error),icon:'none' })
    }finally{this.setData({ loading:false })}
  },
  open(e){wx.navigateTo({ url:`/pages/progress/detail?id=${e.currentTarget.dataset.id}` })}
})
