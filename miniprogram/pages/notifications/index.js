const api = require('../../utils/api')

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const PUSH_LABELS = {
  SENT: '微信提醒已发送',
  NOT_SUBSCRIBED: '仅消息中心提醒',
  NOT_CONFIGURED: '微信模板未配置',
  FAILED: '微信提醒发送失败',
  PENDING: '正在处理微信提醒'
}

Page({
  data: { loading: true, notifications: [], unreadCount: 0 },
  onShow() { this.load() },
  async load() {
    this.setData({ loading: true })
    try {
      const result = await api.call('getNotifications', {}, { silent: true })
      this.setData({
        unreadCount: result.unreadCount,
        notifications: result.notifications.map(item => ({
          ...item,
          displayTime: displayTime(item.createdAt),
          pushLabel: PUSH_LABELS[item.pushStatus] || ''
        }))
      })
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
  async open(e) {
    const id = e.currentTarget.dataset.id
    if (id) await api.call('markNotificationRead', { notificationId: id }, { silent: true }).catch(() => {})
    wx.switchTab({ url: '/pages/today/index' })
  },
  async markAll() {
    await api.call('markAllNotificationsRead')
    await this.load()
  }
})
