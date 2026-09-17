const api = require('../../utils/api')
const { MOOD_ICONS, MOOD_LABELS, CATEGORY_LABELS, NOTE_TYPES } = require('../../utils/constants')

const NOTE_LABELS = Object.fromEntries(NOTE_TYPES.map(item => [item.key, item.label]))

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
    hasRecords: day.active || day.noteCount > 0
  }))
  return { ...calendar, cells: [...blanks, ...days] }
}

function presentReview(review) {
  return {
    ...review,
    dailyReview: review.dailyReview ? {
      ...review.dailyReview,
      moodIcon: MOOD_ICONS[review.dailyReview.mood] || '',
      moodLabel: MOOD_LABELS[review.dailyReview.mood] || ''
    } : null,
    notes: (review.notes || []).map(note => ({ ...note, typeLabel: NOTE_LABELS[note.type] || '小记' })),
    tasks: (review.tasks || []).map(task => ({
      ...task,
      categoryLabel: CATEGORY_LABELS[task.category] || '计划',
      completedTime: clockText(task.completedAt),
      timerSummary: task.timerMode
        ? `有效 ${timerText(task.timerEffectiveSeconds)} · 总用时 ${timerText(task.timerTotalSeconds)} · 暂停 ${timerText(task.timerPausedSeconds)}`
        : '',
      durationLabel: task.durationMinutes == null ? '' : `${task.durationMinutes}分钟`
    }))
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
    selectedDay: null,
    dayReview: { dailyReview: null, notes: [], tasks: [] },
    tasksExpanded: false
  },
  onShow() { this.loadCalendar() },
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
      dayReview: { date: day.date, dailyReview: null, notes: [], tasks: [] },
      tasksExpanded: false
    })
    try {
      const review = await api.call('getDayReview', { reviewDate: requestDate }, { silent: true })
      if (this._reviewRequestDate === requestDate) this.setData({ dayReview: presentReview(review) })
    } catch (error) {
      if (this._reviewRequestDate === requestDate) wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      if (this._reviewRequestDate === requestDate) this.setData({ reviewLoading: false })
    }
  },
  toggleTasks() { this.setData({ tasksExpanded: !this.data.tasksExpanded }) },
  previewImages(e) {
    const note = this.data.dayReview.notes[Number(e.currentTarget.dataset.index)]
    const current = e.currentTarget.dataset.src
    if (note?.attachments?.length) wx.previewImage({ urls: note.attachments, current: current || note.attachments[0] })
  },
  closeReview() {
    this._reviewRequestDate = ''
    this.setData({ reviewVisible: false, reviewLoading: false, tasksExpanded: false })
  },
  noop() {}
})
