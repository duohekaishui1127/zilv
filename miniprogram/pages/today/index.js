const api = require('../../utils/api')
const fmt = require('../../utils/format')
const { CATEGORY_LABELS } = require('../../utils/constants')

const MOODS = [
  { value: 'GREAT', emoji: '😄', label: '很棒' },
  { value: 'GOOD', emoji: '🙂', label: '不错' },
  { value: 'OKAY', emoji: '😐', label: '一般' },
  { value: 'TIRED', emoji: '😮‍💨', label: '疲惫' },
  { value: 'BAD', emoji: '😞', label: '低落' }
]
const MOOD_LABELS = Object.fromEntries(MOODS.map(item => [item.value, `${item.emoji} ${item.label}`]))

function emptyEditor() {
  return {
    visible: false, planId: '', planName: '', category: '', targetType: 'BOOLEAN', unit: '', completed: false,
    durationMinutes: '', actualValue: '', mood: '', note: '', showActualValue: false
  }
}

Page({
  data: {
    loading: true,
    error: '',
    dashboard: null,
    plansExpanded: true,
    energyExpanded: false,
    completionPct: 0,
    proteinPct: 0,
    carbPct: 0,
    fatPct: 0,
    energyState: { deficit: 0, surplus: 0, isDeficit: false, isSurplus: false },
    moods: MOODS,
    completionEditor: emptyEditor(),
    completionSaving: false
  },
  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const d = await api.call('dashboard', {}, { silent: true })
      const target = d.nutritionTarget || {}
      d.homePreferences = { showEnergy: true, showWeightReminder: true, ...(d.homePreferences || {}) }
      d.plans = (d.plans || []).map(plan => ({
        ...plan,
        categoryLabel: CATEGORY_LABELS[plan.category] || '计划',
        checkin: plan.checkin ? { ...plan.checkin, moodLabel: MOOD_LABELS[plan.checkin.mood] || '' } : null
      }))
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
  togglePlans() { this.setData({ plansExpanded: !this.data.plansExpanded }) },
  toggleEnergy() { this.setData({ energyExpanded: !this.data.energyExpanded }) },
  goBody() { wx.navigateTo({ url: '/pages/record/body' }) },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/index' }) },
  openCompletion(e) {
    const plan = this.data.dashboard.plans[Number(e.currentTarget.dataset.index)]
    if (!plan) return
    this.showCompletion(plan)
  },
  showCompletion(plan) {
    const checkin = plan.checkin || {}
    const duration = checkin.durationMinutes ?? (plan.targetType === 'DURATION' ? (checkin.actualValue ?? plan.targetValue) : '')
    this.setData({
      completionEditor: {
        visible: true,
        planId: plan._id,
        planName: plan.name,
        category: plan.category,
        targetType: plan.targetType,
        unit: plan.unit,
        completed: !!plan.completed,
        durationMinutes: duration,
        actualValue: checkin.actualValue ?? plan.targetValue,
        mood: checkin.mood || '',
        note: checkin.note || '',
        showActualValue: plan.targetType === 'COUNT' || plan.targetType === 'VALUE'
      }
    })
  },
  async quickComplete(e) {
    const plan = this.data.dashboard.plans[Number(e.currentTarget.dataset.index)]
    if (!plan || this._quickCompleting) return
    if (plan.completed) return this.showCompletion(plan)
    this._quickCompleting = true
    try {
      const payload = { planId: plan._id, actualValue: Number(plan.targetValue) }
      await api.call('completePlan', payload)
      wx.showToast({ title: '计划已完成', icon: 'success' })
      await this.load()
    } finally {
      this._quickCompleting = false
    }
  },
  closeCompletion() {
    if (!this.data.completionSaving) this.setData({ completionEditor: emptyEditor() })
  },
  noop() {},
  editorInput(e) {
    this.setData({ [`completionEditor.${e.currentTarget.dataset.key}`]: e.detail.value })
  },
  chooseMood(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ 'completionEditor.mood': this.data.completionEditor.mood === value ? '' : value })
  },
  async saveCompletion() {
    if (this.data.completionSaving) return
    const editor = this.data.completionEditor
    const plan = this.data.dashboard.plans.find(item => item._id === editor.planId)
    if (!plan) return

    let durationMinutes = null
    if (editor.durationMinutes !== '') {
      durationMinutes = Number(editor.durationMinutes)
      if (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440) {
        return wx.showToast({ title: '请输入0到1440分钟', icon: 'none' })
      }
    }
    let actualValue = plan.targetValue
    if (plan.targetType === 'DURATION') actualValue = durationMinutes == null ? Number(plan.targetValue) : durationMinutes
    if (editor.showActualValue) {
      actualValue = Number(editor.actualValue)
      if (!Number.isFinite(actualValue) || actualValue < 0) return wx.showToast({ title: '请输入有效完成量', icon: 'none' })
    }

    this.setData({ completionSaving: true })
    try {
      await api.call('completePlan', {
        planId: editor.planId,
        actualValue,
        durationMinutes,
        mood: editor.mood,
        note: editor.note
      })
      this.setData({ completionEditor: emptyEditor() })
      wx.showToast({ title: editor.completed ? '记录已更新' : '计划已完成', icon: 'success' })
      await this.load()
    } finally {
      this.setData({ completionSaving: false })
    }
  }
})
