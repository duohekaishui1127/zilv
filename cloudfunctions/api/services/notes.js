const { cloud, db, _, C } = require('../lib/db')
const { now, fail } = require('../lib/utils')

const RELATION_COLLECTIONS = Object.freeze({
  BODY_RECORD: C.BODY,
  STUDY_SESSION: C.STUDY,
  WORKOUT_SESSION: C.WORKOUTS,
  PLAN: C.PLANS
})

async function assertOwnedRelation(userId, relatedType, relatedId) {
  if (!relatedType || !relatedId) return null
  const collection = RELATION_COLLECTIONS[relatedType]
  if (!collection) throw fail('INVALID_PARAMETER', '关联记录类型不支持')
  const entity = await db.collection(collection).doc(relatedId).get().then(x => x.data).catch(() => null)
  if (!entity || entity.userId !== userId) throw fail('FORBIDDEN', '无权关联该记录')
  return entity
}

async function attachmentsForNotes(noteIds) {
  if (!noteIds.length) return {}
  const result = await db.collection(C.NOTE_ATTACHMENTS).where({ noteId: _.in(noteIds) }).orderBy('sort', 'asc').get()
  return result.data.reduce((map, item) => {
    if (!map[item.noteId]) map[item.noteId] = []
    map[item.noteId].push(item)
    return map
  }, {})
}

async function getOwnedNote(userId, noteId) {
  const note = await db.collection(C.NOTES).doc(noteId).get().then(x => x.data).catch(() => null)
  if (!note || note.userId !== userId || note.status === 'DELETED') throw fail('NOTE_NOT_FOUND', '记录不存在')
  return note
}

async function syncAttachments(userId, noteId, attachments = []) {
  const desired = attachments.slice(0, 9).map((item, index) => ({
    fileId: String(item.fileId || '').trim(),
    mediaType: 'IMAGE',
    poseType: ['FRONT', 'SIDE', 'BACK', 'OTHER'].includes(item.poseType) ? item.poseType : 'OTHER',
    sort: index + 1
  })).filter(item => item.fileId)
  const currentResult = await db.collection(C.NOTE_ATTACHMENTS).where({ noteId, userId }).get()
  const current = currentResult.data
  const desiredIds = new Set(desired.map(x => x.fileId))
  const removed = current.filter(x => !desiredIds.has(x.fileId))
  const currentMap = new Map(current.map(x => [x.fileId, x]))

  for (const item of desired) {
    const existing = currentMap.get(item.fileId)
    if (existing) {
      await db.collection(C.NOTE_ATTACHMENTS).doc(existing._id).update({ data: { poseType: item.poseType, sort: item.sort, updatedAt: now() } })
    } else {
      await db.collection(C.NOTE_ATTACHMENTS).add({ data: { noteId, userId, ...item, createdAt: now(), updatedAt: now() } })
    }
  }
  for (const item of removed) await db.collection(C.NOTE_ATTACHMENTS).doc(item._id).remove()
  if (removed.length) {
    try { await cloud.deleteFile({ fileList: removed.map(x => x.fileId) }) } catch (error) { console.warn('[zilu-note-file-cleanup]', error?.message || error) }
  }
  return desired.length
}

module.exports = { assertOwnedRelation, attachmentsForNotes, getOwnedNote, syncAttachments }
