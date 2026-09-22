const api = require('../../utils/api')
const { PLAN_CATEGORIES, TARGET_TYPES, REPEAT_TYPES, TIMER_MODES } = require('../../utils/constants')

function indexOfValue(list, value, fallback = 0) {
  const index = list.findIndex(x => x.value === value)
  return index >= 0 ? index : fallback
}

Page({
  data: {
    id:'',editMode:false,loading:false,saving:false,managed:false,
    name: '', description: '',
    categories: PLAN_CATEGORIES.map(x => x.label), categoryValues: PLAN_CATEGORIES.map(x => x.value), categoryIndex: 0,
    targetTypes: TARGET_TYPES.map(x => x.label), targetValues: TARGET_TYPES.map(x => x.value), targetIndex: 0,
    targetValue: 1, unit: '', weeklyCount: 3,
    executionDate: api.localDate(), executionTime: '08:00', hasExecutionTime: false,
    timerModes: TIMER_MODES.map(x => x.label), timerValues: TIMER_MODES.map(x => x.value), timerIndex: 0,
    timerDurationMinutes: 25, isCountdown: false,
    repeatTypes: REPEAT_TYPES.map(x => x.label), repeatValues: REPEAT_TYPES.map(x => x.value), repeatIndex: 0,
    isOneTime: true, isSpecificDays: false, isWeeklyCount: false,
    weekdays: [1,2,3,4,5,6,7].map((value, i) => ({ value, label: ['一','二','三','四','五','六','日'][i], selected: false }))
  },
  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id, editMode: true })
      wx.setNavigationBarTitle({ title: '编辑执行任务' })
      this.loadPlan()
    }
  },
  async loadPlan() {
    this.setData({ loading: true })
    try {
      const { plan } = await api.call('getPlan', { planId: this.data.id })
      const repeatIndex = indexOfValue(REPEAT_TYPES, plan.repeatType)
      const selectedDays = new Set(plan.repeatConfig?.weekdays || [])
      this.setData({
        managed:Boolean(plan.managedByGoalId),
        name: plan.name,
        description: plan.description || '',
        categoryIndex: indexOfValue(PLAN_CATEGORIES, plan.category),
        targetIndex: indexOfValue(TARGET_TYPES, plan.targetType),
        targetValue: plan.targetValue,
        unit: plan.unit || '',
        weeklyCount: plan.repeatConfig?.weeklyCount || (plan.repeatType === 'WEEKLY_COUNT' ? plan.targetValue : 3),
        executionDate: plan.startDate || api.localDate(), executionTime: plan.executionTime || '08:00', hasExecutionTime: Boolean(plan.executionTime),
        timerIndex: indexOfValue(TIMER_MODES, plan.timerMode || 'NONE'),
        timerDurationMinutes: plan.timerDurationMinutes || 25,
        isCountdown: plan.timerMode === 'COUNT_DOWN',
        repeatIndex,
        isOneTime: plan.repeatType === 'ONE_TIME', isSpecificDays: plan.repeatType === 'SPECIFIC_WEEKDAYS',
        isWeeklyCount: plan.repeatType === 'WEEKLY_COUNT',
        weekdays: this.data.weekdays.map(x => ({ ...x, selected: selectedDays.has(x.value) }))
      })
    } finally { this.setData({ loading: false }) }
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  category(e) { this.setData({ categoryIndex: Number(e.detail.value) }) },
  target(e) { this.setData({ targetIndex: Number(e.detail.value) }) },
  timerMode(e) {
    const timerIndex = Number(e.detail.value)
    this.setData({ timerIndex, isCountdown: this.data.timerValues[timerIndex] === 'COUNT_DOWN' })
  },
  repeat(e) {
    const i = Number(e.detail.value)
    const value = this.data.repeatValues[i]
    this.setData({ repeatIndex: i, isOneTime: value === 'ONE_TIME', isSpecificDays: value === 'SPECIFIC_WEEKDAYS', isWeeklyCount: value === 'WEEKLY_COUNT' })
  },
  dateChange(e) { this.setData({ executionDate: e.detail.value }) },
  timeChange(e) { this.setData({ executionTime: e.detail.value }) },
  toggleExecutionTime(e) { this.setData({ hasExecutionTime: Boolean(e.detail.value) }) },
  toggleDay(e) {
    const day = Number(e.currentTarget.dataset.day)
    this.setData({ weekdays: this.data.weekdays.map(x => x.value === day ? { ...x, selected: !x.selected } : x) })
  },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) return wx.showToast({ title: '请输入任务名称', icon: 'none' })
    const repeatType = this.data.repeatValues[this.data.repeatIndex]
    const selectedDays = this.data.weekdays.filter(x => x.selected).map(x => x.value)
    if (repeatType === 'SPECIFIC_WEEKDAYS' && !selectedDays.length) return wx.showToast({ title: '请至少选择一天', icon: 'none' })
    const targetValue = Number(this.data.targetValue || 1)
    if (!Number.isFinite(targetValue) || targetValue <= 0) return wx.showToast({ title: '目标值必须大于0', icon: 'none' })
    const weeklyCount = Number(this.data.weeklyCount || 1)
    if (repeatType === 'WEEKLY_COUNT' && (!Number.isFinite(weeklyCount) || weeklyCount < 1 || weeklyCount > 7)) return wx.showToast({ title: '每周次数应为1到7次', icon: 'none' })
    const timerMode = this.data.timerValues[this.data.timerIndex]
    const timerDurationMinutes = Number(this.data.timerDurationMinutes || 0)
    if (timerMode === 'COUNT_DOWN' && (!Number.isFinite(timerDurationMinutes) || timerDurationMinutes < 1 || timerDurationMinutes > 1440)) {
      return wx.showToast({ title: '倒计时应为1到1440分钟', icon: 'none' })
    }
    const plan = {
      name,
      description: this.data.description.trim(),
      category: this.data.categoryValues[this.data.categoryIndex],
      targetType: this.data.targetValues[this.data.targetIndex],
      targetValue,
      unit: this.data.unit,
      repeatType,
      repeatConfig: { weekdays: selectedDays, weeklyCount: repeatType === 'WEEKLY_COUNT' ? Number(this.data.weeklyCount || 1) : undefined },
      startDate: this.data.executionDate,
      executionTime: this.data.hasExecutionTime ? this.data.executionTime : '',
      timerMode,
      timerDurationMinutes: timerMode === 'COUNT_DOWN' ? timerDurationMinutes : null
    }
    this.setData({ saving: true })
    try {
      const result=this.data.editMode
        ? await api.call('updatePlan',{ planId:this.data.id,plan })
        : await api.call('createPlan',{ plan })
      const approval=Boolean(result.approvalRequired)
      wx.showToast({ title:approval ? '已提交群主审核' : (this.data.editMode ? '计划已更新' : '计划已创建'),icon:approval ? 'none' : 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } finally { this.setData({ saving: false }) }
  }
})
