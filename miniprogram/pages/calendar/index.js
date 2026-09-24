const api = require('../../utils/api')
const { MOODS, MOOD_ICONS, MOOD_LABELS, CATEGORY_LABELS, NOTE_TYPES } = require('../../utils/constants')

const NOTE_LABELS = Object.fromEntries(NOTE_TYPES.map(item => [item.key, item.label]))
function emptyMakeupEditor() { return { visible: false, freeEdit: false, step: 'TASKS', date: '', tasks: [], mood: '', note: '', saving: false } }

function shiftMonth(value, amount) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function dateTitle(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function timerText(seconds) {
  const value = Math.max(0, Math.round(Number(seconds || 0)))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const rest = value % 60
  return hours ? `${hours}小时${minutes}分${rest}秒` : `${minutes}分${rest}秒`
}

function clockText(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function decorateCalendar(calendar, currentDate) {
  if (!calendar?.days?.length) return { ...calendar, cells: [] }
  const first = new Date(`${calendar.month}-01T12:00:00`)
  const leading = (first.getDay() + 6) % 7
  const blanks = Array.from({ length: leading }, (_, index) => ({ key: `blank-${index}`, blank: true }))
  const days = calendar.days.map(day => ({
    ...day,
    key: day.date,
    today: day.date === currentDate,
    activityClass: `activity-${day.activityScore}`,
    moodIcon: MOOD_ICONS[day.mood] || '',
    moodLabel: MOOD_LABELS[day.mood] || '',
    checkinClass: day.dailyCheckedIn
      ? (day.dailyCheckinState === 'COMPLETE' ? 'checkin-complete' : 'checkin-incomplete')
      : '',
    makeup: day.checkinMode === 'MAKEUP',
    hasRecords: day.active || day.noteCount > 0
  }))
  return {
    ...calendar, cells: [...blanks, ...days],
    showYesterdayShortcut: calendar.month === currentDate.slice(0, 7)
      && calendar.makeup?.yesterday?.slice(0, 7) !== calendar.month && Number(calendar.makeup?.balance || 0) > 0
  }
}

function presentReview(review) {
  const tasks = (review.tasks || []).map(task => ({
    ...task,
    categoryLabel: CATEGORY_LABELS[task.category] || '计划',
    completedTime: clockText(task.completedAt),
    targetLabel: task.targetType === 'BOOLEAN' || task.targetValue == null ? '' : `${task.targetValue}${task.unit || ''}`,
    timerSummary: task.timerMode
      ? `有效 ${timerText(task.timerEffectiveSeconds)} · 总用时 ${timerText(task.timerTotalSeconds)} · 暂停 ${timerText(task.timerPausedSeconds)}`
      : '',
    durationLabel: task.durationMinutes == null ? '' : `${task.durationMinutes}分钟`
  }))
  return {
    ...review,
    dailyReview: review.dailyReview ? {
      ...review.dailyReview,
      moodIcon: MOOD_ICONS[review.dailyReview.mood] || '',
      moodLabel: MOOD_LABELS[review.dailyReview.mood] || '',
      checkinClass: review.dailyReview.allPlansCompleted ? 'checkin-complete' : 'checkin-incomplete',
      checkinLabel: `${review.dailyReview.checkinMode === 'MAKEUP' ? '补签 · ' : ''}${review.dailyReview.allPlansCompleted ? '任务完成打卡' : '任务未完成打卡'}`
    } : null,
    notes: (review.notes || []).map(note => ({ ...note, typeLabel: NOTE_LABELS[note.type] || '小记' })),
    taskProgress: review.taskProgress || {
      completed: tasks.filter(task => task.completed).length,
      total: tasks.length
    },
    tasks
  }
}

Page({
  data: {
    weekdayLabels: ['一', '二', '三', '四', '五', '六', '日'],
    month: api.localDate().slice(0, 7),
    currentDate: api.localDate(),
    calendar: null,
    loading: true,
    error: '',
    reviewVisible: false,
    reviewLoading: false,
    makeupEligible: false,
    moods: MOODS,
    makeupEditor: emptyMakeupEditor(),
    selectedDay: null,
    dayReview: { dailyReview: null, taskProgress: { completed: 0, total: 0 }, notes: [], tasks: [] },
    tasksExpanded: false
  },
  onShow() { this.setData({ currentDate: api.localDate() }); this.loadCalendar() },
  onHide() { this.closeReview() },
  onPullDownRefresh() { this.loadCalendar().finally(() => wx.stopPullDownRefresh()) },
  async loadCalendar() {
    this.setData({ loading: true, error: '' })
    try {
      const calendar = await api.call('getActivityCalendar', { month: this.data.month }, { silent: true })
      this.setData({ calendar: decorateCalendar(calendar, this.data.currentDate) })
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  monthChange(e) { this.setData({ month: e.detail.value, calendar: null }, () => this.loadCalendar()) },
  previousMonth() { this.setData({ month: shiftMonth(this.data.month, -1), calendar: null }, () => this.loadCalendar()) },
  nextMonth() { this.setData({ month: shiftMonth(this.data.month, 1), calendar: null }, () => this.loadCalendar()) },
  retry() { this.loadCalendar() },
  async openDay(e) {
    const day = this.data.calendar?.cells?.[Number(e.currentTarget.dataset.index)]
    if (!day || day.blank) return
    const requestDate = day.date
    this._reviewRequestDate = requestDate
    this.setData({
      reviewVisible: true,
      reviewLoading: true,
      selectedDay: { ...day, title: dateTitle(day.date) },
      dayReview: { date: day.date, dailyReview: null, taskProgress: { completed: 0, total: 0 }, notes: [], tasks: [] },
      tasksExpanded: false,
      makeupEligible: false
    })
    try {
      const review = await api.call('getDayReview', { reviewDate: requestDate }, { silent: true })
      if (this._reviewRequestDate === requestDate) this.setData({
        dayReview: presentReview(review),
        makeupEligible: requestDate === this.data.calendar?.makeup?.yesterday && !review.dailyReview
      })
    } catch (error) {
      if (this._reviewRequestDate === requestDate) wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      if (this._reviewRequestDate === requestDate) this.setData({ reviewLoading: false })
    }
  },
  toggleTasks() { this.setData({ tasksExpanded: !this.data.tasksExpanded }) },
  showMakeupInfo() {
    const balance = Number(this.data.calendar?.makeup?.balance || 0)
    wx.showModal({
      title: `补签卡 × ${balance}`,
      content: '初始 3 张，每月补充 1 张，最多保留 3 张。仅能补签昨天，保存成功后才消耗。',
      showCancel: false
    })
  },
  openYesterdayMonth() {
    const month = this.data.calendar?.makeup?.yesterday?.slice(0, 7)
    if (month && month !== this.data.month) this.setData({ month, calendar: null }, () => this.loadCalendar())
  },
  editDayReview() {
    const review = this.data.dayReview.dailyReview
    if (!review || this.data.makeupEditor.visible) return
    this.setData({ makeupEditor: {
      ...emptyMakeupEditor(), visible: true, freeEdit: true, step: 'REVIEW',
      date: this.data.selectedDay.date, mood: review.mood || '', note: review.note || ''
    } })
  },
  startMakeup() {
    if (!this.data.makeupEligible || this.data.makeupEditor.visible) return
    if (!this.data.calendar?.makeup?.balance) return this.showMakeupInfo()
    this.setData({ makeupEditor: {
      ...emptyMakeupEditor(), visible: true, date: this.data.selectedDay.date,
      tasks: this.data.dayReview.tasks.filter(task => !task.completed).map(task => ({
        planId: task.planId, name: task.name, categoryLabel: task.categoryLabel,
        targetLabel: task.targetLabel, timerStatus: task.timerStatus, selected: false
      }))
    } })
  },
  closeMakeup() {
    if (!this.data.makeupEditor.saving) this.setData({ makeupEditor: emptyMakeupEditor() })
  },
  toggleMakeupTask(e) {
    if (this.data.makeupEditor.saving) return
    const index = Number(e.currentTarget.dataset.index)
    const tasks = [...this.data.makeupEditor.tasks]
    const task = tasks[index]
    if (!task) return
    if (['RUNNING', 'PAUSED'].includes(task.timerStatus)) {
      return wx.showToast({ title: '请先结束该任务的计时', icon: 'none' })
    }
    tasks[index] = { ...task, selected: !task.selected }
    this.setData({ 'makeupEditor.tasks': tasks })
  },
  nextMakeupStep() { this.setData({ 'makeupEditor.step': 'REVIEW' }) },
  previousMakeupStep() { this.setData({ 'makeupEditor.step': 'TASKS' }) },
  chooseMakeupMood(e) {
    const mood = e.currentTarget.dataset.value
    this.setData({ 'makeupEditor.mood': this.data.makeupEditor.mood === mood ? '' : mood })
  },
  makeupNoteInput(e) { this.setData({ 'makeupEditor.note': e.detail.value }) },
  async submitMakeup() {
    const editor = this.data.makeupEditor
    if (!editor.visible || editor.saving || editor.step !== 'REVIEW') return
    this.setData({ 'makeupEditor.saving': true })
    try {
      if (editor.freeEdit) {
        await api.call('saveDailyReview', { date: editor.date, mood: editor.mood, note: editor.note }, { silent: true })
      } else {
        await api.call('makeupDailyCheckin', {
          makeupDate: editor.date, completedPlanIds: editor.tasks.filter(task => task.selected).map(task => task.planId),
          mood: editor.mood, note: editor.note
        }, { silent: true })
      }
      this.setData({ makeupEditor: emptyMakeupEditor() })
      this.closeReview()
      await this.loadCalendar()
      wx.showToast({ title: editor.freeEdit ? '记录已保存' : '补签成功', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this.setData({ 'makeupEditor.saving': false })
    }
  },
  previewImages(e) {
    const note = this.data.dayReview.notes[Number(e.currentTarget.dataset.index)]
    const current = e.currentTarget.dataset.src
    if (note?.attachments?.length) wx.previewImage({ urls: note.attachments, current: current || note.attachments[0] })
  },
  closeReview() {
    if (this.data.makeupEditor.saving) return
    this._reviewRequestDate = ''
    this.setData({ reviewVisible: false, reviewLoading: false, tasksExpanded: false, makeupEligible: false, makeupEditor: emptyMakeupEditor() })
  },
  noop() {}
})
