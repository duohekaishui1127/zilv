const { db, _, C } = require('../lib/db')
const { now } = require('../lib/utils')
const validate = require('../lib/validators')
const { NOTE_TYPES, normalizeNotePayload } = require('../domain/note')
const { assertOwnedRelation, attachmentsForNotes, getOwnedNote, syncAttachments } = require('../services/notes')

async function saveNote({ user, event, localDate }) {
  const payload = normalizeNotePayload(event, localDate)
  await assertOwnedRelation(user._id, payload.relatedType, payload.relatedId)
  let note
  const clientMutationId = validate.string(event.clientMutationId, { name: '请求标识', max: 100 })
  if (event.noteId) {
    note = await getOwnedNote(user._id, event.noteId)
    const data = { ...payload, updatedAt: now() }
    await db.collection(C.NOTES).doc(note._id).update({ data })
    note = { ...note, ...data }
  } else {
    if (clientMutationId) {
      const existing = await db.collection(C.NOTES).where({ userId: user._id, clientMutationId, status: 'ACTIVE' }).limit(1).get()
      if (existing.data.length) note = existing.data[0]
    }
    if (note) {
      const data = { ...payload, updatedAt: now() }
      await db.collection(C.NOTES).doc(note._id).update({ data })
      note = { ...note, ...data }
    } else {
      const data = { userId: user._id, clientMutationId: clientMutationId || null, ...payload, status: 'ACTIVE', attachmentCount: 0, createdAt: now(), updatedAt: now() }
      const add = await db.collection(C.NOTES).add({ data })
      note = { _id: add._id, ...data }
    }
  }
  const attachmentCount = await syncAttachments(user._id, note._id, Array.isArray(event.attachments) ? event.attachments : [])
  await db.collection(C.NOTES).doc(note._id).update({ data: { attachmentCount, updatedAt: now() } })
  return { note: { ...note, attachmentCount } }
}

async function getNotes({ user, event }) {
  const type = event.type && event.type !== 'ALL' ? validate.enumValue(event.type, NOTE_TYPES, { name: '记录类型' }) : null
  const limit = Math.min(Math.max(Number(event.limit || 20), 1), 50)
  const where = { userId: user._id, status: 'ACTIVE' }
  if (type) where.type = type
  if (event.before) {
    const timestamp = Number(event.before)
    if (Number.isFinite(timestamp)) where.createdAt = _.lt(new Date(timestamp))
  }
  const result = await db.collection(C.NOTES).where(where).orderBy('createdAt', 'desc').limit(limit).get()
  const map = await attachmentsForNotes(result.data.map(x => x._id))
  const notes = result.data.map(note => ({ ...note, attachments: map[note._id] || [] }))
  const nextBefore = notes.length === limit ? new Date(notes[notes.length - 1].createdAt).getTime() : null
  return { notes, nextBefore, hasMore: !!nextBefore }
}

async function getNote({ user, event }) {
  const note = await getOwnedNote(user._id, event.noteId)
  const map = await attachmentsForNotes([note._id])
  return { note: { ...note, attachments: map[note._id] || [] } }
}

async function deleteNote({ user, event }) {
  const note = await getOwnedNote(user._id, event.noteId)
  const attachmentResult = await db.collection(C.NOTE_ATTACHMENTS).where({ noteId: note._id, userId: user._id }).get()
  await db.collection(C.NOTES).doc(note._id).update({ data: { status: 'DELETED', deletedAt: now(), updatedAt: now() } })
  await Promise.all(attachmentResult.data.map(item => db.collection(C.NOTE_ATTACHMENTS).doc(item._id).remove()))
  if (attachmentResult.data.length) {
    const { cloud } = require('../lib/db')
    try { await cloud.deleteFile({ fileList: attachmentResult.data.map(x => x.fileId) }) } catch (error) { console.warn('[zilu-note-file-cleanup]', error?.message || error) }
  }
  return { deleted: true }
}

module.exports = { saveNote, getNotes, getNote, deleteNote }
