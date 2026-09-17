const validate = require('../lib/validators')

const NOTE_TYPES = Object.freeze(['GENERAL', 'BODY', 'STUDY', 'WORKOUT', 'DIET'])
const NOTE_TYPE_TITLES = Object.freeze({
  GENERAL: '日常记录', BODY: '体态记录', STUDY: '学习笔记', WORKOUT: '训练笔记', DIET: '饮食记录'
})

function normalizeNotePayload(input = {}, localDate) {
  const type = validate.enumValue(input.type || 'GENERAL', NOTE_TYPES, { name: '记录类型' })
  const recordDate = validate.date(input.recordDate || localDate)
  const content = validate.string(input.content, { name: '正文', max: 5000 })
  let title = validate.string(input.title, { name: '标题', max: 100 })
  if (!title) title = `${NOTE_TYPE_TITLES[type]} · ${recordDate}`
  return {
    type,
    title,
    content,
    recordDate,
    tags: validate.stringArray(input.tags, { name: '标签', maxItems: 8, maxItemLength: 20 }),
    relatedType: validate.string(input.relatedType, { name: '关联类型', max: 30 }),
    relatedId: validate.string(input.relatedId, { name: '关联记录', max: 100 }),
    visibility: 'PRIVATE'
  }
}

module.exports = { NOTE_TYPES, NOTE_TYPE_TITLES, normalizeNotePayload }
