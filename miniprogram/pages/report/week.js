const api = require('../../utils/api')
const { drawLineChart } = require('../../utils/chart')

function shiftMonth(value, amount) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
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
    detail: [day.checkinCount ? `${day.checkinCount}次打卡` : '', day.workoutMinutes ? `运动${day.workoutMinutes}分` : '', day.studyMinutes ? `学习${day.studyMinutes}分` : ''].filter(Boolean).join(' · ')
  }))
  return { ...calendar, cells: [...blanks, ...days] }
}

Page({
  data: {
    ranges: [{ days: 7, label: '7天' }, { days: 30, label: '30天' }, { days: 90, label: '90天' }],
    weekdayLabels: ['一', '二', '三', '四', '五', '六', '日'],
    selectedDays: 30,
    report: null,
    calendar: null,
    month: api.localDate().slice(0, 7),
    currentDate: api.localDate(),
    loading: true,
    calendarLoading: true,
    error: '',
    hasWeight: false,
    hasBodyFat: false,
    hasBalance: false,
    hasActivity: false
  },
  onLoad() { Promise.all([this.loadReport(), this.loadCalendar()]) },
  async loadReport() {
    this.setData({ loading: true, error: '' })
    try {
      const report = await api.call('getProgressReport', { days: this.data.selectedDays }, { silent: true })
      const hasWeight = report.daily.some(day => day.weightKg != null)
      const hasBodyFat = report.daily.some(day => day.bodyFat != null)
      const hasBalance = report.daily.some(day => day.calorieBalance != null)
      const hasActivity = report.daily.some(day => day.workoutMinutes || day.studyMinutes)
      this.setData({ report, hasWeight, hasBodyFat, hasBalance, hasActivity }, () => this.drawCharts())
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally {
      this.setData({ loading: false })
    }
  },
  async loadCalendar() {
    this.setData({ calendarLoading: true })
    try {
      const calendar = await api.call('getActivityCalendar', { month: this.data.month }, { silent: true })
      this.setData({ calendar: decorateCalendar(calendar, this.data.currentDate) })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this.setData({ calendarLoading: false })
    }
  },
  selectRange(e) {
    const days = Number(e.currentTarget.dataset.days)
    if (days === this.data.selectedDays || this.data.loading) return
    this.setData({ selectedDays: days }, () => this.loadReport())
  },
  monthChange(e) { this.setData({ month: e.detail.value }, () => this.loadCalendar()) },
  previousMonth() { this.setData({ month: shiftMonth(this.data.month, -1) }, () => this.loadCalendar()) },
  nextMonth() { this.setData({ month: shiftMonth(this.data.month, 1) }, () => this.loadCalendar()) },
  retry() { this.loadReport() },
  drawCharts() {
    const report = this.data.report
    if (!report?.daily?.length) return
    const labels = { startLabel: report.startDate.slice(5), endLabel: report.endDate.slice(5) }
    if (this.data.hasWeight) {
      drawLineChart(this, '#weightChart', [{ values: report.daily.map(day => day.weightKg), color: '#2563eb', connectNulls: true }], { ...labels, unit: 'kg' })
    }
    if (this.data.hasBodyFat) {
      drawLineChart(this, '#bodyFatChart', [{ values: report.daily.map(day => day.bodyFat), color: '#7c3aed', connectNulls: true }], { ...labels, unit: '%' })
    }
    if (this.data.hasBalance) drawLineChart(this, '#balanceChart', [{ values: report.daily.map(day => day.calorieBalance), color: '#059669' }], { ...labels, unit: '', zeroBaseline: true })
    if (this.data.hasActivity) drawLineChart(this, '#activityChart', [
      { values: report.daily.map(day => day.workoutMinutes), color: '#ea580c' },
      { values: report.daily.map(day => day.studyMinutes), color: '#2563eb' }
    ], { ...labels, unit: '分', zeroBaseline: true })
  }
})
