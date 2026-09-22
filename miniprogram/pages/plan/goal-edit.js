const api = require('../../utils/api')
const { LONG_TERM_GOAL_TYPES } = require('../../utils/constants')

function futureDate(days = 90) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return api.localDate(date)
}

Page({
  data: {
    id: '', editMode: false, loading: false, saving: false,
    name: '', description: '', goalTypes: LONG_TERM_GOAL_TYPES,
    goalType: 'DEADLINE', deadlineDate: futureDate(), habitDays: 21,
    targetValue: 5000, unit: '词', unlimited: false
  },
  onLoad(options) {
    if (!options.id) return
    this.setData({ id: options.id, editMode: true })
    wx.setNavigationBarTitle({ title: '编辑长期目标' })
    this.load()
  },
  async load() {
    this.setData({ loading: true })
    try {
      const { plan } = await api.call('getPlan', { planId: this.data.id })
      this.setData({
        name: plan.name || '', description: plan.description || '', goalType: plan.goalType || 'DEADLINE',
        deadlineDate: plan.deadlineDate || futureDate(), habitDays: plan.habitDays || 21,
        targetValue: plan.targetValue || 5000, unit: plan.unit || '次', unlimited: Boolean(plan.unlimited)
      })
    } finally { this.setData({ loading: false }) }
  },
  chooseType(e) { this.setData({ goalType: e.currentTarget.dataset.value }) },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  dateChange(e) { this.setData({ deadlineDate: e.detail.value }) },
  toggleUnlimited(e) { this.setData({ unlimited: Boolean(e.detail.value) }) },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) return wx.showToast({ title: '请输入目标名称', icon: 'none' })
    const goal = {
      name, description: this.data.description.trim(), goalType: this.data.goalType,
      deadlineDate: this.data.deadlineDate, habitDays: Number(this.data.habitDays || 21),
      targetValue: Number(this.data.targetValue || 0), unit: this.data.unit.trim(), unlimited: this.data.unlimited
    }
    this.setData({ saving: true })
    try {
      const result = this.data.editMode
        ? await api.call('updateLongTermGoal', { goalId: this.data.id, goal })
        : await api.call('createLongTermGoal', { goal })
      wx.showToast({ title: result.achievedGoals?.length ? '长期目标已达成' : (this.data.editMode ? '目标已更新' : '目标已创建'), icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } finally { this.setData({ saving: false }) }
  }
})
