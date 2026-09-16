const api = require('../../utils/api')
const { CATEGORY_LABELS, REPEAT_LABELS } = require('../../utils/constants')
Page({
  data: { plans: [] },
  onShow() { this.load() },
  async load() {
    const d = await api.call('getPlans')
    this.setData({ plans: d.plans.map(p => ({ ...p, categoryLabel: CATEGORY_LABELS[p.category] || p.category, repeatLabel: REPEAT_LABELS[p.repeatType] || p.repeatType })) })
  },
  add() { wx.navigateTo({ url: '/pages/plan/edit' }) },
  edit(e) { wx.navigateTo({ url: `/pages/plan/edit?id=${e.currentTarget.dataset.id}` }) },
  bindGroup(e) { wx.navigateTo({ url: `/pages/plan/bind?planId=${e.currentTarget.dataset.id}&name=${encodeURIComponent(e.currentTarget.dataset.name)}` }) },
  async toggle(e) {
    await api.call('setPlanEnabled', { planId: e.currentTarget.dataset.id, enabled: !e.currentTarget.dataset.enabled })
    await this.load()
  },
  async remove(e) {
    if (!await api.confirm('删除后历史打卡会保留，但该计划不再继续执行。确认删除？', '删除计划')) return
    await api.call('deletePlan', { planId: e.currentTarget.dataset.id })
    wx.showToast({ title: '已删除', icon: 'success' })
    await this.load()
  }
})
