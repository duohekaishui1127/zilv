const api = require('../../utils/api')
const { PLAN_CATEGORIES, TARGET_TYPES, REPEAT_TYPES, TIMER_MODES } = require('../../utils/constants')

function indexOfValue(list, value, fallback = 0) {
  const index = list.findIndex(x => x.value === value)
  return index >= 0 ? index : fallback
}

Page({
  data: {
    id: '', editMode: false, loading: false, saving: false,
    name: '', description: '',
    categories: PLAN_CATEGORIES.map(x => x.label), categoryValues: PLAN_CATEGORIES.map(x => x.value), categoryIndex: 0,
    targetTypes: TARGET_TYPES.map(x => x.label), targetValues: TARGET_TYPES.map(x => x.value), targetIndex: 0,
    targetValue: 1, unit: '', weeklyCount: 3,
    timerModes: TIMER_MODES.map(x => x.label), timerValues: TIMER_MODES.map(x => x.value), timerIndex: 0,
    timerDurationMinutes: 25, isCountdown: false,
    repeatTypes: REPEAT_TYPES.map(x => x.label), repeatValues: REPEAT_TYPES.map(x => x.value), repeatIndex: 0,
    isSpecificDays: false, isWeeklyCount: false,
    reminderEnabled: false, reminderTime: '21:00', reminderPushEnabled: false,
    reminderTemplateId: '', reminderConfigLoaded: false, subscribing: false,
    subscriptionLabel: '尚未订阅微信提醒',
    weekdays: [1,2,3,4,5,6,7].map((value, i) => ({ value, label: ['一','二','三','四','五','六','日'][i], selected: false }))
  },
  onLoad(options) {
    this.loadReminderConfig()
    if (options.id) {
      this.setData({ id: options.id, editMode: true })
      wx.setNavigationBarTitle({ title: '编辑计划' })
      this.loadPlan()
    }
  },
  async loadReminderConfig() {
    try {
      const config = await api.call('getReminderConfig', {}, { silent: true })
      this.setData({ reminderTemplateId: config.templateId || '', reminderConfigLoaded: true })
    } catch (error) {
      this.setData({ reminderTemplateId: '', reminderConfigLoaded: true })
    }
  },
  async loadPlan() {
    this.setData({ loading: true })
    try {
      const { plan } = await api.call('getPlan', { planId: this.data.id })
      const repeatIndex = indexOfValue(REPEAT_TYPES, plan.repeatType)
      const selectedDays = new Set(plan.repeatConfig?.weekdays || [])
      this.setData({
        name: plan.name,
        description: plan.description || '',
        categoryIndex: indexOfValue(PLAN_CATEGORIES, plan.category),
        targetIndex: indexOfValue(TARGET_TYPES, plan.targetType),
        targetValue: plan.targetValue,
        unit: plan.unit || '',
        weeklyCount: plan.repeatConfig?.weeklyCount || (plan.repeatType === 'WEEKLY_COUNT' ? plan.targetValue : 3),
        timerIndex: indexOfValue(TIMER_MODES, plan.timerMode || 'NONE'),
        timerDurationMinutes: plan.timerDurationMinutes || 25,
        isCountdown: plan.timerMode === 'COUNT_DOWN',
        repeatIndex,
        isSpecificDays: plan.repeatType === 'SPECIFIC_WEEKDAYS',
        isWeeklyCount: plan.repeatType === 'WEEKLY_COUNT',
        reminderEnabled: !!plan.reminderEnabled,
        reminderTime: plan.reminderTime || '21:00',
        reminderPushEnabled: !!plan.reminderPushEnabled,
        subscriptionLabel: plan.reminderPushEnabled ? '已订阅下一次微信提醒' : '尚未订阅微信提醒',
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
    this.setData({ repeatIndex: i, isSpecificDays: value === 'SPECIFIC_WEEKDAYS', isWeeklyCount: value === 'WEEKLY_COUNT' })
  },
  reminderToggle(e) {
    const enabled = !!e.detail.value
    this.setData({ reminderEnabled: enabled, ...(!enabled ? { reminderPushEnabled: false, subscriptionLabel: '尚未订阅微信提醒' } : {}) })
  },
  reminderTimeChange(e) { this.setData({ reminderTime: e.detail.value }) },
  async subscribeReminder() {
    if (this.data.subscribing) return
    if (!this.data.reminderEnabled) return wx.showToast({ title: '请先开启计划提醒', icon: 'none' })
    if (!this.data.reminderTemplateId) {
      return wx.showModal({
        title: '微信提醒尚未配置',
        content: '当前仍可使用消息中心提醒。请先在云函数环境变量中配置订阅消息模板。',
        showCancel: false
      })
    }
    this.setData({ subscribing: true })
    try {
      const result = await wx.requestSubscribeMessage({ tmplIds: [this.data.reminderTemplateId] })
      const status = result[this.data.reminderTemplateId]
      const accepted = status === 'accept' || status === 'acceptWithAudio'
      this.setData({
        reminderPushEnabled: accepted,
        subscriptionLabel: accepted ? '已订阅下一次微信提醒' : '未允许微信提醒，可继续使用消息中心'
      })
      wx.showToast({ title: accepted ? '已订阅一次提醒' : '未开启微信提醒', icon: 'none' })
    } catch (error) {
      this.setData({ reminderPushEnabled: false, subscriptionLabel: '订阅失败，可稍后重试' })
      wx.showToast({ title: '订阅失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ subscribing: false })
    }
  },
  toggleDay(e) {
    const day = Number(e.currentTarget.dataset.day)
    this.setData({ weekdays: this.data.weekdays.map(x => x.value === day ? { ...x, selected: !x.selected } : x) })
  },
  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) return wx.showToast({ title: '请输入计划名称', icon: 'none' })
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
      timerMode,
      timerDurationMinutes: timerMode === 'COUNT_DOWN' ? timerDurationMinutes : null,
      reminderEnabled: this.data.reminderEnabled,
      reminderTime: this.data.reminderTime,
      reminderTimezoneOffset: -new Date().getTimezoneOffset(),
      reminderPushEnabled: this.data.reminderPushEnabled
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
