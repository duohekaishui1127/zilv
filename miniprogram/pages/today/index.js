const api = require('../../utils/api')
const fmt = require('../../utils/format')
const { CATEGORY_LABELS } = require('../../utils/constants')

Page({
  data: {
    loading: true,
    error: '',
    dashboard: null,
    completionPct: 0,
    proteinPct: 0,
    carbPct: 0,
    fatPct: 0,
    energyState: { deficit: 0, surplus: 0, isDeficit: false, isSurplus: false }
  },
  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const d = await api.call('dashboard', {}, { silent: true })
      const target = d.nutritionTarget || {}
      d.plans = (d.plans || []).map(plan => ({ ...plan, categoryLabel: CATEGORY_LABELS[plan.category] || '计划' }))
      this.setData({
        dashboard: d,
        completionPct: fmt.pct(d.completion.completed, d.completion.total),
        proteinPct: fmt.pct(d.nutrition.proteinIntake, target.proteinGram),
        carbPct: fmt.pct(d.nutrition.carbIntake, target.carbGram),
        fatPct: fmt.pct(d.nutrition.fatIntake, target.fatGram),
        energyState: fmt.energyState(d.energy.estimatedCalorieBalance)
      })
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  retry() { this.load() },
  goBody() { wx.navigateTo({ url: '/pages/record/body' }) },
  goFood() { wx.navigateTo({ url: '/pages/record/food' }) },
  goWorkout() { wx.navigateTo({ url: '/pages/record/workout' }) },
  goStudy() { wx.navigateTo({ url: '/pages/record/study' }) },
  goNotes() { wx.navigateTo({ url: '/pages/notes/index' }) },
  async completePlan(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this._completing) return
    this._completing = true
    try {
      await api.call('completePlan', { planId: id })
      wx.showToast({ title: '已打卡', icon: 'success' })
      await this.load()
    } finally {
      this._completing = false
    }
  }
})
