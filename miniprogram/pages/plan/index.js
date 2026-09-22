const api = require('../../utils/api')
const { CATEGORY_LABELS, REPEAT_LABELS, TIMER_MODES, LONG_TERM_GOAL_TYPES } = require('../../utils/constants')
const TIMER_LABELS = Object.fromEntries(TIMER_MODES.map(item => [item.value, item.label]))
const GOAL_LABELS = Object.fromEntries(LONG_TERM_GOAL_TYPES.map(item => [item.value, item.label]))

function goalView(goal) {
  let progressText = ''
  if (goal.goalType === 'DEADLINE') {
    progressText = goal.goalStatus === 'COMPLETED'
      ? `已归档 · 考试日 ${goal.deadlineDate}`
      : `距离考试还有 ${goal.daysRemaining} 天`
  } else if (goal.goalType === 'HABIT') {
    progressText = `连续 ${goal.currentValue}/${goal.targetValue} 天`
  } else {
    progressText = goal.unlimited
      ? `已累计 ${goal.currentValue}${goal.unit}`
      : `${goal.currentValue}/${goal.targetValue}${goal.unit}`
  }
  return {
    ...goal,
    goalTypeLabel: GOAL_LABELS[goal.goalType] || '长期目标',
    canManualComplete:goal.goalType !== 'DEADLINE',
    progressText,
    progressPct: goal.progressPct == null ? 0 : goal.progressPct,
    hasProgressBar: goal.goalType !== 'DEADLINE' && !goal.unlimited
  }
}
Page({
  data: { plans: [], goals: [] },
  onShow() { this.load() },
  async load() {
    const d = await api.call('getPlans')
    const goals = (d.goals || []).map(goalView)
    const activeGoalIds = new Set(goals.filter(goal => goal.goalStatus === 'ACTIVE').map(goal => goal._id))
    this.setData({ plans: d.plans.map(p => ({
      ...p,
      categoryLabel: CATEGORY_LABELS[p.category] || p.category,
      repeatLabel: REPEAT_LABELS[p.repeatType] || p.repeatType,
      scheduleLabel: p.repeatType === 'ONE_TIME' ? `${p.startDate} · 仅一次` : (REPEAT_LABELS[p.repeatType] || p.repeatType),
      timerLabel: TIMER_LABELS[p.timerMode || 'NONE'] || '不计时',
      goalBindingCount: Array.isArray(p.longTermGoalIds) ? p.longTermGoalIds.filter(id => activeGoalIds.has(id)).length : 0
    })), goals: goals.filter(goal => goal.goalStatus === 'ACTIVE') })
  },
  async add() {
    try {
      const result = await wx.showActionSheet({ itemList: ['执行任务', '长期目标'] })
      wx.navigateTo({ url: result.tapIndex === 1 ? '/pages/plan/goal-edit' : '/pages/plan/edit' })
    } catch (error) {}
  },
  edit(e) { wx.navigateTo({ url: `/pages/plan/edit?id=${e.currentTarget.dataset.id}` }) },
  editGoal(e) { wx.navigateTo({ url: `/pages/plan/goal-edit?id=${e.currentTarget.dataset.id}` }) },
  bindGroup(e) { wx.navigateTo({ url: `/pages/plan/bind?planId=${e.currentTarget.dataset.id}&name=${encodeURIComponent(e.currentTarget.dataset.name)}` }) },
  async toggle(e) {
    const result=await api.call('setPlanEnabled', { planId: e.currentTarget.dataset.id, enabled: !e.currentTarget.dataset.enabled })
    if(result.approvalRequired)wx.showToast({title:'已提交群主审核',icon:'none'})
    await this.load()
  },
  async remove(e) {
    if (!await api.confirm('删除后历史打卡会保留，但该计划不再继续执行。确认删除？', '删除计划')) return
    const result=await api.call('deletePlan', { planId: e.currentTarget.dataset.id })
    wx.showToast({ title:result.approvalRequired ? '已提交群主审核' : '已删除',icon:result.approvalRequired ? 'none' : 'success' })
    await this.load()
  },
  async finishGoal(e) {
    if (!await api.confirm('完成后将归档到已达成目标，历史进度会保留。', '完成长期目标')) return
    await api.call('completeLongTermGoal', { goalId: e.currentTarget.dataset.id })
    wx.showToast({ title: '已归档', icon: 'success' })
    await this.load()
  },
  async removeGoal(e) {
    if (!await api.confirm('删除目标会解除任务关联，但不会删除历史打卡。', '删除长期目标')) return
    await api.call('deleteLongTermGoal', { goalId: e.currentTarget.dataset.id })
    wx.showToast({ title: '已删除', icon: 'success' })
    await this.load()
  }
})
