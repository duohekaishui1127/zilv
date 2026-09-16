const api = require('../../utils/api')
const { NOTE_TYPES } = require('../../utils/constants')

const FILTERS = [{ key: 'ALL', label: '全部' }, ...NOTE_TYPES]
const NOTE_LABELS = Object.fromEntries(NOTE_TYPES.map(item => [item.key, item.label]))

function presentNote(note) {
  const attachments = note.attachments || []
  return { ...note, typeLabel: NOTE_LABELS[note.type] || '记录', previewAttachments: attachments.slice(0, 3), morePhotoCount: Math.max(0, attachments.length - 3) }
}

Page({
  data: { filters: FILTERS, activeType: 'ALL', notes: [], loading: false, error: '', hasMore: false, nextBefore: null },
  onShow() { this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  async load(reset = false) {
    if (this.data.loading) return
    this.setData({ loading: true, error: reset ? '' : this.data.error })
    try {
      const result = await api.call('getNotes', {
        type: this.data.activeType,
        limit: 20,
        before: reset ? null : this.data.nextBefore
      }, { silent: true })
      this.setData({
        notes: reset ? result.notes.map(presentNote) : [...this.data.notes, ...result.notes.map(presentNote)],
        hasMore: result.hasMore,
        nextBefore: result.nextBefore,
        error: ''
      })
    } catch (error) {
      this.setData({ error: api.messageOf(error) })
    } finally { this.setData({ loading: false }) }
  },
  filter(e) {
    const type = e.currentTarget.dataset.type
    if (!type || type === this.data.activeType) return
    this.setData({ activeType: type, notes: [], nextBefore: null, hasMore: false })
    this.load(true)
  },
  retry() { this.load(true) },
  add() { wx.navigateTo({ url: '/pages/notes/edit' }) },
  edit(e) { wx.navigateTo({ url: `/pages/notes/edit?noteId=${e.currentTarget.dataset.id}` }) },
  loadMore() { if (this.data.hasMore) this.load(false) }
})
