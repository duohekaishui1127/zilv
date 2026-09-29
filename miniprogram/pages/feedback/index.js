const api = require('../../utils/api')
const { APP_VERSION } = require('../../config/version')

const STATUS_LABELS = {
  NEW: '待处理', REVIEWED: '已查看', PLANNED: '计划优化', COMPLETED: '已完成', DECLINED: '暂不处理'
}

function displayTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function mutationId() {
  return `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function presentFeedback(item) {
  return {
    ...item,
    images: item.images || [],
    statusLabel: STATUS_LABELS[item.status] || '处理中',
    statusClass: item.status === 'COMPLETED' ? 'tag-active' : '',
    displayTime: displayTime(item.createdAt),
    replyDisplayTime: displayTime(item.repliedAt)
  }
}

Page({
  data: {
    content: '',
    attachments: [],
    feedbacks: [],
    clientMutationId: mutationId(),
    saving: false,
    loading: true
  },
  onLoad() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  input(e) { if (!this.data.saving) this.setData({ content: e.detail.value }) },
  async chooseImages() {
    if (this.data.saving) return
    const remain = 3 - this.data.attachments.length
    if (remain <= 0) return wx.showToast({ title: '最多添加3张截图', icon: 'none' })
    try {
      const result = await wx.chooseMedia({ count: remain, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      const added = result.tempFiles.map((item, index) => ({ key: `${Date.now()}-${index}`, tempPath: item.tempFilePath, fileId: '' }))
      this.setData({ attachments: [...this.data.attachments, ...added] })
    } catch (error) {
      if (!/cancel/i.test(error?.errMsg || '')) wx.showToast({ title: '选择图片失败', icon: 'none' })
    }
  },
  async removeImage(e) {
    if (this.data.saving) return
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.attachments[index]
    this.setData({ attachments: this.data.attachments.filter((_, i) => i !== index) })
    if (item?.fileId) await api.deleteFiles([item.fileId])
  },
  previewDraft(e) {
    const urls = this.data.attachments.map(item => item.tempPath || item.fileId).filter(Boolean)
    wx.previewImage({ urls, current: urls[Number(e.currentTarget.dataset.index)] || urls[0] })
  },
  previewHistory(e) {
    const item = this.data.feedbacks[Number(e.currentTarget.dataset.feedbackIndex)]
    if (item?.images?.length) wx.previewImage({ urls: item.images, current: e.currentTarget.dataset.photo || item.images[0] })
  },
  async load() {
    const loadId = Number(this._feedbackLoadId || 0) + 1
    this._feedbackLoadId = loadId
    this.setData({ loading: true })
    try {
      const result = await api.call('getMyFeedbacks', { limit: 30 }, { silent: true })
      if (loadId !== this._feedbackLoadId) return
      this.setData({ feedbacks: (result.feedbacks || []).map(presentFeedback) })
    } catch (error) {
      if (loadId === this._feedbackLoadId) wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      if (loadId === this._feedbackLoadId) this.setData({ loading: false })
    }
  },
  async submit() {
    if (this.data.saving) return
    const content = this.data.content.trim()
    if (!content) return wx.showToast({ title: '请填写反馈内容', icon: 'none' })
    this.setData({ saving: true })
    try {
      const attachments = [...this.data.attachments]
      for (let index = 0; index < attachments.length; index++) {
        if (!attachments[index].fileId && attachments[index].tempPath) {
          attachments[index].fileId = await api.uploadImage(attachments[index].tempPath, 'feedback')
          attachments[index].tempPath = ''
          this.setData({ attachments })
        }
      }
      let system = {}
      try { system = wx.getSystemInfoSync() || {} } catch (error) {
        console.warn('[feedback-device-info]', '设备信息暂不可用')
      }
      const result = await api.call('submitFeedback', {
        // A fixed legacy category keeps older cloud versions compatible.
        category: 'OTHER',
        content,
        images: attachments.map(item => item.fileId).filter(Boolean),
        clientMutationId: this.data.clientMutationId,
        deviceInfo: {
          platform: system.platform,
          system: system.system,
          model: system.model,
          wechatVersion: system.version,
          sdkVersion: system.SDKVersion,
          appVersion: APP_VERSION
        }
      }, { silent: true })
      wx.showToast({ title: '反馈已提交', icon: 'success' })
      this.setData({ content: '', attachments: [], clientMutationId: mutationId() })
      if (result?.feedback) {
        this._feedbackLoadId = Number(this._feedbackLoadId || 0) + 1
        this.setData({
          loading: false,
          feedbacks: [presentFeedback(result.feedback), ...this.data.feedbacks.filter(item => item._id !== result.feedback._id)].slice(0, 30)
        })
      } else await this.load()
    } catch (error) {
      wx.showToast({ title: api.messageOf(error), icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
