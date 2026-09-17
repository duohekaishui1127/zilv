const api = require('../../utils/api')

const STATUSES = [
  { value: 'NEW', label: '待处理' },
  { value: 'REVIEWED', label: '已查看' },
  { value: 'PLANNED', label: '计划优化' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'DECLINED', label: '暂不处理' }
]
const STATUS_LABELS = Object.fromEntries(STATUSES.map(item => [item.value, item.label]))

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: { feedbacks: [], statuses: STATUSES, loading: true, updating: false },
  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true })
    try {
      const result = await api.call('getFeedbackInbox', { limit: 100 })
      this.setData({
        feedbacks: (result.feedbacks || []).map(item => ({
          ...item,
          images: item.images || [],
          deviceInfo: item.deviceInfo || {},
          statusLabel: STATUS_LABELS[item.status] || '处理中',
          displayTime: displayTime(item.createdAt)
        }))
      })
    } finally {
      this.setData({ loading: false })
    }
  },
  preview(e) {
    const item = this.data.feedbacks[Number(e.currentTarget.dataset.feedbackIndex)]
    if (item?.images?.length) wx.previewImage({ urls: item.images, current: e.currentTarget.dataset.photo || item.images[0] })
  },
  async setStatus(e) {
    if (this.data.updating) return
    this.setData({ updating: true })
    try {
      await api.call('updateFeedbackStatus', {
        feedbackId: e.currentTarget.dataset.id,
        status: e.currentTarget.dataset.status
      })
      wx.showToast({ title: '状态已更新', icon: 'success' })
      await this.load()
    } finally {
      this.setData({ updating: false })
    }
  }
})
