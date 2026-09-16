const api = require('../../utils/api')
const { NOTE_TYPES, POSE_TYPES } = require('../../utils/constants')

function decode(value = '') { try { return decodeURIComponent(value) } catch (e) { return value } }

Page({
  data: {
    noteId: '', typeOptions: NOTE_TYPES, typeIndex: 0, poseOptions: POSE_TYPES,
    recordDate: api.localDate(), title: '', content: '', tagsText: '',
    relatedType: '', relatedId: '', attachments: [], saving: false, loading: false, clientMutationId: ''
  },
  onLoad(options) {
    this._draftKey = `zilu-note-draft-${options.relatedType || 'general'}-${options.relatedId || 'new'}`
    this.setData({ clientMutationId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` })
    if (options.noteId) {
      this.setData({ noteId: options.noteId })
      this.loadNote(options.noteId)
      return
    }
    const typeIndex = Math.max(0, NOTE_TYPES.findIndex(x => x.key === (options.type || 'GENERAL')))
    this.setData({
      typeIndex,
      recordDate: options.recordDate || api.localDate(),
      relatedType: options.relatedType || '', relatedId: options.relatedId || '',
      title: decode(options.title || '')
    })
    this.restoreDraft()
  },
  async loadNote(noteId) {
    this.setData({ loading: true })
    try {
      const result = await api.call('getNote', { noteId })
      const note = result.note
      const typeIndex = Math.max(0, NOTE_TYPES.findIndex(x => x.key === note.type))
      this.setData({
        typeIndex, recordDate: note.recordDate, title: note.title || '', content: note.content || '',
        tagsText: (note.tags || []).join('，'), relatedType: note.relatedType || '', relatedId: note.relatedId || '',
        attachments: (note.attachments || []).map(item => ({ fileId: item.fileId, tempPath: '', poseType: item.poseType || 'OTHER' }))
      })
    } finally { this.setData({ loading: false }) }
  },
  async restoreDraft() {
    const draft = wx.getStorageSync(this._draftKey)
    if (!draft || !draft.savedAt) return
    const confirm = await api.confirm('发现一份未保存的日志草稿，是否恢复？', '恢复草稿')
    if (confirm) this.setData({ ...draft.data, attachments: (draft.data.attachments || []).filter(x => x.tempPath || x.fileId) })
    else wx.removeStorageSync(this._draftKey)
  },
  persistDraft() {
    if (this.data.noteId) return
    const { typeIndex, recordDate, title, content, tagsText, relatedType, relatedId, attachments, clientMutationId } = this.data
    wx.setStorageSync(this._draftKey, { savedAt: Date.now(), data: { typeIndex, recordDate, title, content, tagsText, relatedType, relatedId, attachments, clientMutationId } })
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }, () => this.persistDraft()) },
  changeType(e) { this.setData({ typeIndex: Number(e.detail.value) }, () => this.persistDraft()) },
  changeDate(e) { this.setData({ recordDate: e.detail.value }, () => this.persistDraft()) },
  async chooseImages() {
    const remain = 9 - this.data.attachments.length
    if (remain <= 0) return wx.showToast({ title: '最多添加9张图片', icon: 'none' })
    try {
      const result = await wx.chooseMedia({ count: remain, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      const added = result.tempFiles.map(item => ({ tempPath: item.tempFilePath, fileId: '', poseType: 'OTHER' }))
      this.setData({ attachments: [...this.data.attachments, ...added] }, () => this.persistDraft())
    } catch (error) {
      if (!/cancel/i.test(error?.errMsg || '')) wx.showToast({ title: '选择图片失败', icon: 'none' })
    }
  },
  changePose(e) {
    const index = Number(e.currentTarget.dataset.index)
    const poseType = POSE_TYPES[Number(e.detail.value)]?.key || 'OTHER'
    const key = `attachments[${index}].poseType`
    this.setData({ [key]: poseType }, () => this.persistDraft())
  },
  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const attachments = this.data.attachments.filter((_, i) => i !== index)
    this.setData({ attachments }, () => this.persistDraft())
  },
  preview(e) {
    const index = Number(e.currentTarget.dataset.index)
    const urls = this.data.attachments.map(item => item.tempPath || item.fileId).filter(Boolean)
    if (urls.length) wx.previewImage({ urls, current: urls[index] || urls[0] })
  },
  async save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const attachments = []
      for (let index = 0; index < this.data.attachments.length; index++) {
        const item = this.data.attachments[index]
        let fileId = item.fileId
        if (!fileId && item.tempPath) {
          fileId = await api.uploadImage(item.tempPath, 'note-attachments')
          this.setData({ [`attachments[${index}].fileId`]: fileId, [`attachments[${index}].tempPath`]: '' }, () => this.persistDraft())
        }
        if (fileId) attachments.push({ fileId, poseType: item.poseType || 'OTHER' })
      }
      const type = NOTE_TYPES[this.data.typeIndex]?.key || 'GENERAL'
      const tags = this.data.tagsText.split(/[,，#\s]+/).map(x => x.trim()).filter(Boolean)
      await api.call('saveNote', {
        noteId: this.data.noteId || undefined,
        type, recordDate: this.data.recordDate, title: this.data.title, content: this.data.content,
        tags, relatedType: this.data.relatedType, relatedId: this.data.relatedId, attachments,
        clientMutationId: this.data.clientMutationId
      })
      if (!this.data.noteId) wx.removeStorageSync(this._draftKey)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    } catch (error) {
      // 云函数超时可能发生在服务端已提交之后。保留已上传文件并保存在草稿中，用户重试时复用同一 mutationId，避免重复记录。
      this.persistDraft()
    } finally { this.setData({ saving: false }) }
  },
  async remove() {
    if (!this.data.noteId) return
    if (!(await api.confirm('删除后图片也会从云存储清理，确定删除吗？', '删除记录'))) return
    await api.call('deleteNote', { noteId: this.data.noteId })
    wx.showToast({ title: '已删除', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 300)
  }
})
