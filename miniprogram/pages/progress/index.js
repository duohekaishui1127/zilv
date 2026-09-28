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
    statusLabel=goal.completionMode === 'TERMINATED' ? '已结束' : '已达成'
    const accumulated=snapshot.accumulatedValue == null ? goal.currentValue : snapshot.accumulatedValue
    summary=goal.unlimited
      ? `累计 ${accumulated || 0}${goal.unit || ''}`
      : `累计 ${accumulated || 0}/${goal.targetValue}${goal.unit || ''}`
  }
  return {
    ...goal,typeLabel:goal.goalType === 'DEADLINE' ? '考试计划' : (TYPE_LABELS[goal.goalType] || '长期目标'),
    statusLabel,summary
  }
}

function badgeView(item,membership) {
  const target=Math.max(1,Number(item.target || 1))
  const progress=Math.min(target,Number(item.progress || 0))
  const detailLocked=Boolean(item.pro && !membership?.isPro)
  return { ...item,detailLocked,progressPct:Math.round(progress / target * 100),progressLabel:item.unlocked ? '已获得' : `${progress}/${target}` }
}

Page({
  data:{ loading:true,goals:[],badges:[],achievementSummary:null,membership:null,identityCode:'',flippedBadgeId:'' },
  onShow(){this.load()},
  async load(){
    this.setData({ loading:true })
    try{
      const [result,achievements]=await Promise.all([
        api.call('getProgressGoals',{}, { silent:true }),
        api.call('getAchievements',{}, { silent:true })
      ])
      this.setData({
        goals:(result.goals || []).map(goalView),
        badges:(achievements.badges || []).map(item => badgeView(item,achievements.membership)),
        achievementSummary:{ unlockedCount:achievements.unlockedCount || 0,totalCount:achievements.totalCount || 0 },
        membership:achievements.membership || null,
        identityCode:achievements.identityCode || ''
      })
    }catch(error){
      wx.showToast({ title:api.messageOf(error),icon:'none' })
    }finally{this.setData({ loading:false })}
  },
  flipBadge(e){
    const id=e.currentTarget.dataset.id
    const badge=this.data.badges.find(item => item.id === id)
    if(!badge?.unlocked)return
    if(badge.detailLocked)return wx.navigateTo({url:'/pages/pro/index'})
    this.setData({ flippedBadgeId:this.data.flippedBadgeId === id ? '' : id })
  },
  open(e){wx.navigateTo({ url:`/pages/progress/detail?id=${e.currentTarget.dataset.id}` })}
})
