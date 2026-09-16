const api = require('../../utils/api')

Page({
  data: { weightKg: '', bodyFat: '', metricDefs: [], records: [], saving: false, loading: true },
  onShow() { this.load() },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },
  metricInput(e) { this.setData({ [`metricDefs[${Number(e.currentTarget.dataset.index)}].value`]: e.detail.value }) },
  async load() {
    this.setData({ loading: true })
    try {
      const [history, config] = await Promise.all([
        api.call('getBodyHistory', { limit: 30 }),
        api.call('getBodyMetricConfig')
      ])
      const selected = new Set(config.selectedCodes || [])
      this.setData({ records: history.records, metricDefs: (config.metrics || []).map(item => ({ ...item, selected: selected.has(item.code), value: '' })) })
    } finally { this.setData({ loading: false }) }
  },
  async toggleMetric(e) {
    const index = Number(e.currentTarget.dataset.index)
    const metricDefs = this.data.metricDefs.map((item, i) => i === index ? { ...item, selected: !item.selected } : item)
    this.setData({ metricDefs })
    const metricCodes = metricDefs.filter(item => item.selected).map(item => item.code)
    try { await api.call('saveBodyMetricPrefs', { metricCodes }, { silent: true }) }
    catch (error) { await this.load() }
  },
  async save() {
    if (this.data.saving) return
    const weight = Number(this.data.weightKg)
    if (!Number.isFinite(weight) || weight < 20 || weight > 400) return wx.showToast({ title: '请输入有效体重', icon: 'none' })
    const metrics = {}
    this.data.metricDefs.filter(item => item.selected).forEach(item => {
      const value = item.value
      if (value !== '' && value !== undefined) metrics[item.code] = Number(value)
    })
    this.setData({ saving: true })
    try {
      const result = await api.call('addBodyRecord', { record: { weightKg: weight, bodyFat: this.data.bodyFat || null, metrics } })
      wx.showToast({ title: '已保存并更新目标', icon: 'success' })
      this.setData({ weightKg: '', bodyFat: '', metricDefs: this.data.metricDefs.map(item => ({ ...item, value: '' })) })
      await this.load()
      const addNote = await api.confirm('要不要顺手拍几张体态照片或写下当前状态？', '继续记录')
      if (addNote && result.record?._id) {
        wx.navigateTo({ url: `/pages/notes/edit?type=BODY&relatedType=BODY_RECORD&relatedId=${result.record._id}&recordDate=${result.record.recordDate}` })
      }
    } finally { this.setData({ saving: false }) }
  }
})
