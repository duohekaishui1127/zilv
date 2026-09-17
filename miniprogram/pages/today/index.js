const api = require('../../utils/api')
const fmt = require('../../utils/format')
const { CATEGORY_LABELS, MOODS, MOOD_LABELS, MOOD_ICONS } = require('../../utils/constants')

function emptyEditor() {
  return {
    visible: false, planId: '', planName: '', category: '', targetType: 'BOOLEAN', unit: '', completed: false,
    durationMinutes: '', actualValue: '', mood: '', note: '', showActualValue: false, timed: false,
    timerEffectiveDisplay: '', timerTotalDisplay: '', timerPausedDisplay: ''
  }
}

function timeMs(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function formatTimer(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const short = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return hours ? `${String(hours).padStart(2, '0')}:${short}` : short
}

function timerView(plan, nowMs) {
  const checkin = plan.checkin || {}
  const status = checkin.timerStatus || ''
  const timerMode = checkin.timerMode || plan.timerMode || 'NONE'
  if (timerMode === 'NONE') return { timerEnabled: false }

  const startedAt = timeMs(checkin.timerStartedAt)
  const resumedAt = timeMs(checkin.timerResumedAt)
  const accumulatedMs = Math.max(0, Number(checkin.timerAccumulatedMs || 0))
  let effectiveMs = accumulatedMs
  if (status === 'RUNNING' && resumedAt != null) effectiveMs += Math.max(0, nowMs - resumedAt)
  if (status === 'FINISHED') effectiveMs = Math.max(0, Number(checkin.timerEffectiveSeconds || 0) * 1000)

  const targetSeconds = Number(checkin.timerTargetSeconds || (timerMode === 'COUNT_DOWN' ? Number(plan.timerDurationMinutes || 0) * 60 : 0))
  const reachedTarget = timerMode === 'COUNT_DOWN' && targetSeconds > 0 && effectiveMs >= targetSeconds * 1000
  if (reachedTarget) effectiveMs = targetSeconds * 1000

  const totalMs = status === 'FINISHED'
    ? Math.max(0, Number(checkin.timerTotalSeconds || 0) * 1000)
    : (startedAt == null ? 0 : Math.max(0, nowMs - startedAt))
  const pausedMs = status === 'FINISHED'
    ? Math.max(0, Number(checkin.timerPausedSeconds || 0) * 1000)
    : Math.max(0, totalMs - effectiveMs)
  const effectiveSeconds = Math.floor(effectiveMs / 1000)
  const displaySeconds = timerMode === 'COUNT_DOWN'
    ? Math.max(0, Math.ceil(targetSeconds - effectiveMs / 1000))
    : effectiveSeconds
  const statusLabels = { RUNNING: '专注中', PAUSED: '已暂停', FINISHED: '计时结束' }

  return {
    timerEnabled: true,
    timerMode,
    timerModeLabel: timerMode === 'COUNT_DOWN' ? '倒计时' : '正计时',
    timerStatus: status,
    timerStatusLabel: statusLabels[status] || '尚未开始',
    timerDisplay: formatTimer(displaySeconds),
    timerEffectiveDisplay: formatTimer(effectiveSeconds),
    timerTotalDisplay: formatTimer(Math.floor(totalMs / 1000)),
    timerPausedDisplay: formatTimer(Math.floor(pausedMs / 1000)),
    timerExpired: status === 'RUNNING' && reachedTarget
  }
}

function decoratePlan(plan, nowMs) {
  return {
    ...plan,
    categoryLabel: CATEGORY_LABELS[plan.category] || '计划',
    checkin: plan.checkin ? { ...plan.checkin, moodLabel: MOOD_LABELS[plan.checkin.mood] || '', moodIcon: MOOD_ICONS[plan.checkin.mood] || '' } : null,
    ...timerView(plan, nowMs)
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
    completionSaving: false,
    timerBusyPlanId: ''
  },
  onShow() { this._visible = true; this.load() },
  onHide() { this._visible = false; this.stopTicker() },
  onUnload() { this._visible = false; this.stopTicker() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  serverNow() { return Date.now() + Number(this._clockOffset || 0) },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const d = await api.call('dashboard', {}, { silent: true })
      const serverMs = timeMs(d.serverTime)
      this._clockOffset = serverMs == null ? 0 : serverMs - Date.now()
      const target = d.nutritionTarget || {}
      d.homePreferences = { showEnergy: true, showWeightReminder: true, ...(d.homePreferences || {}) }
      d.plans = (d.plans || []).map(plan => decoratePlan(plan, this.serverNow()))
      this.setData({
        dashboard: d,
        completionPct: fmt.pct(d.completion.completed, d.completion.total),
        proteinPct: fmt.pct(d.nutrition.proteinIntake, target.proteinGram),
        carbPct: fmt.pct(d.nutrition.carbIntake, target.carbGram),
        fatPct: fmt.pct(d.nutrition.fatIntake, target.fatGram),
        energyState: fmt.energyState(d.energy.estimatedCalorieBalance)
      })
      this.startTicker()
      this.finishExpiredCountdown()
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  startTicker() {
    this.stopTicker()
    if (!this._visible) return
    const plans = this.data.dashboard?.plans || []
    if (!plans.some(plan => ['RUNNING', 'PAUSED'].includes(plan.timerStatus))) return
    this._timerTicker = setInterval(() => this.tickTimers(), 1000)
  },
  stopTicker() {
    if (this._timerTicker) clearInterval(this._timerTicker)
    this._timerTicker = null
  },
  tickTimers() {
    if (!this.data.dashboard) return
    const plans = this.data.dashboard.plans.map(plan => decoratePlan(plan, this.serverNow()))
    this.setData({ 'dashboard.plans': plans })
    this.finishExpiredCountdown()
  },
  async finishExpiredCountdown() {
    const plan = this.data.dashboard?.plans?.find(item => item.timerExpired)
    if (!plan || this._autoFinishingTimer) return
    this._autoFinishingTimer = plan._id
    try {
      await api.call('finishPlanTimer', { planId: plan._id }, { silent: true })
      await this.load()
      const refreshed = this.data.dashboard?.plans?.find(item => item._id === plan._id)
      if (refreshed) this.showCompletion(refreshed)
      wx.showToast({ title: '倒计时完成', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this._autoFinishingTimer = ''
    }
  },
  retry() { this.load() },
  togglePlans() { this.setData({ plansExpanded: !this.data.plansExpanded }) },
  toggleEnergy() { this.setData({ energyExpanded: !this.data.energyExpanded }) },
  goBody() { wx.navigateTo({ url: '/pages/record/body' }) },
  goNotifications() { wx.navigateTo({ url: '/pages/notifications/index' }) },
  planFromEvent(e) { return this.data.dashboard?.plans?.[Number(e.currentTarget.dataset.index)] },
  openCompletion(e) {
    const plan = this.planFromEvent(e)
    if (!plan) return
    if (plan.timerEnabled && !plan.completed) {
      if (plan.timerStatus === 'FINISHED') return this.showCompletion(plan)
      const message = plan.timerStatus ? '请先结束当前计时' : '请先开始计时'
      return wx.showToast({ title: message, icon: 'none' })
    }
    this.showCompletion(plan)
  },
  showCompletion(plan) {
    const checkin = plan.checkin || {}
    const timed = !!checkin.timerStatus
    const duration = timed
      ? Math.round(Number(checkin.timerEffectiveSeconds || 0) / 6) / 10
      : (checkin.durationMinutes ?? (plan.targetType === 'DURATION' ? (checkin.actualValue ?? plan.targetValue) : ''))
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
        actualValue: checkin.actualValue ?? (plan.targetType === 'DURATION' && timed ? duration : plan.targetValue),
        mood: checkin.mood || '',
        note: checkin.note || '',
        showActualValue: plan.targetType === 'COUNT' || plan.targetType === 'VALUE',
        timed,
        timerEffectiveDisplay: plan.timerEffectiveDisplay,
        timerTotalDisplay: plan.timerTotalDisplay,
        timerPausedDisplay: plan.timerPausedDisplay
      }
    })
  },
  async quickComplete(e) {
    const plan = this.planFromEvent(e)
    if (!plan || this._quickCompleting) return
    if (plan.completed) return this.showCompletion(plan)
    if (plan.timerEnabled) {
      if (plan.timerStatus === 'FINISHED') return this.showCompletion(plan)
      return wx.showToast({ title: plan.timerStatus ? '请先结束计时' : '请使用计时按钮开始', icon: 'none' })
    }
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
  async timerAction(action, e) {
    const plan = this.planFromEvent(e)
    if (!plan || this.data.timerBusyPlanId) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      await api.call(action, { planId: plan._id })
      await this.load()
    } finally {
      this.setData({ timerBusyPlanId: '' })
    }
  },
  startTimer(e) { return this.timerAction('startPlanTimer', e) },
  pauseTimer(e) { return this.timerAction('pausePlanTimer', e) },
  resumeTimer(e) { return this.timerAction('resumePlanTimer', e) },
  async finishTimer(e) {
    const plan = this.planFromEvent(e)
    if (!plan || this.data.timerBusyPlanId) return
    if (!await api.confirm('结束后将停止计时，并进入完成记录。', '结束计时')) return
    this.setData({ timerBusyPlanId: plan._id })
    try {
      await api.call('finishPlanTimer', { planId: plan._id })
      await this.load()
      const refreshed = this.data.dashboard?.plans?.find(item => item._id === plan._id)
      if (refreshed) this.showCompletion(refreshed)
    } finally {
      this.setData({ timerBusyPlanId: '' })
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
