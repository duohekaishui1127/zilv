const api = require('../../utils/api')
const { CATEGORY_LABELS, REPEAT_LABELS, TIMER_MODES } = require('../../utils/constants')
const TIMER_LABELS = Object.fromEntries(TIMER_MODES.map(item => [item.value, item.label]))
Page({
  data: { plans: [] },
  onShow() { this.load() },
  async load() {
    const d = await api.call('getPlans')
    this.setData({ plans: d.plans.map(p => ({
      ...p,
      categoryLabel: CATEGORY_LABELS[p.category] || p.category,
      repeatLabel: REPEAT_LABELS[p.repeatType] || p.repeatType,
      timerLabel: TIMER_LABELS[p.timerMode || 'NONE'] || '不计时'
    })) })
  },
  add() { wx.navigateTo({ url: '/pages/plan/edit' }) },
  edit(e) { wx.navigateTo({ url: `/pages/plan/edit?id=${e.currentTarget.dataset.id}` }) },
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
  }
})
