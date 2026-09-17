const api = require('../../utils/api')
const { drawLineChart } = require('../../utils/chart')

Page({
  data: {
    ranges: [{ days: 7, label: '7天' }, { days: 30, label: '30天' }, { days: 90, label: '90天' }],
    selectedDays: 30,
    report: null,
    loading: true,
    error: '',
    hasWeight: false,
    hasBodyFat: false,
    hasBalance: false,
    hasActivity: false
  },
  onLoad() { this.loadReport() },
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
  selectRange(e) {
    const days = Number(e.currentTarget.dataset.days)
    if (days === this.data.selectedDays || this.data.loading) return
    this.setData({ selectedDays: days }, () => this.loadReport())
  },
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
